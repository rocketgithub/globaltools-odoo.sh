odoo.define("whatsapp_connector.audio_player", (function(require) {
    "use strict";
    var Widget = require("web.Widget"), core = require("web.core"), session = require("web.session"), _t = core._t, AudioPlayer = Widget.extend({
        template: "acrux_audio_player",
        events: {
            "loadeddata audio": "onLoadData",
            "error audio": "onError",
            "timeupdate audio": "onTimeUpdate",
            "ended audio": "onEnded",
            "click .play > a": "onPlayPause",
            "click .progress": "changeProgress",
            "click .download": "onDownload"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.src = options.src, 
            this.ignoreTimeUpdateEvent = !1;
        },
        willStart: function() {
            return this._super().then((() => {
                this.promise && this.resolve(), this.promise = new Promise((resolve => this.resolve = resolve));
            }));
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        _initRender: function() {
            let out = Promise.resolve();
            return this.$player = this.$(".o_acrux_audio_player"), this.$audio = this.$("audio"), 
            this.audio_obj = this.$audio ? this.$audio[0] : {}, this.$progress = this.$player.find(".progress"), 
            this.$time = this.$player.find(".time"), this.$progress_play = this.$progress.find(".playback"), 
            this.$player_play = this.$player.find(".play > a"), this.$player.addClass("o_hidden"), 
            Object.keys(this.events).forEach((key => {
                if (key.includes("audio")) {
                    const str = key.split(" ");
                    this.$audio.on(str[0], this[this.events[key]].bind(this));
                }
            })), this.src && (out = this.promise, this.$audio[0].load(), setTimeout((() => {
                this.promise && (this.resolve(), this.promise = null);
            }), 2e3)), out;
        },
        destroy: function() {
            this.$audio && Object.keys(this.events).forEach((key => {
                if (key.includes("audio")) {
                    const str = key.split(" ");
                    this.$audio.off(str[0]);
                }
            })), this.promise && (this.resolve(), this.promise = null), this._super();
        },
        setAudio: function(audio) {
            this.src = audio;
        },
        onLoadData: function(event) {
            const audio = event.target;
            this.$player.removeClass("o_hidden"), this.$time.html(this.calculateTime(audio.duration)), 
            this.resolve(), this.promise = null;
        },
        onError: function() {
            this.$player.html(_t("Audio not found")), this.$player.removeClass("o_acrux_audio_player"), 
            this.$player.removeClass("o_hidden"), this.resolve(), this.promise = null;
        },
        onTimeUpdate: function(event) {
            const audio = event.target;
            let percentage = 100 * audio.currentTime / audio.duration;
            percentage = Math.round(percentage), this.$progress_play.width(percentage + "%"), 
            this.ignoreTimeUpdateEvent || this.$time.html(this.calculateTime(audio.currentTime));
        },
        onEnded: function(event) {
            this.ignoreTimeUpdateEvent = !0;
            const audio = event.target;
            audio.currentTime = 0, this.$player_play.html("▶"), this.$time.html(this.calculateTime(audio.duration));
        },
        onPlayPause: function(event) {
            event.preventDefault(), this.ignoreTimeUpdateEvent = !1, this.audio_obj.paused ? (this.audio_obj.play(), 
            $(event.target).html("⏸️")) : (this.audio_obj.pause(), $(event.target).html("▶"));
        },
        changeProgress: function(event) {
            let relative_position, percentage;
            this.ignoreTimeUpdateEvent = !1, relative_position = event.pageX - this.$progress.offset().left, 
            percentage = relative_position / this.$progress.outerWidth(), Number.isFinite(this.audio_obj.duration) && (this.audio_obj.currentTime = this.audio_obj.duration * percentage);
        },
        calculateTime: function(num) {
            let out = "";
            if (!isNaN(num) && Number.isFinite(num)) {
                let zero = x => x < 10 ? "0" + x : x, minutes = Math.floor(num / 60), seconds = Math.round(num) % 60, hours = Math.floor(minutes / 60);
                minutes = Math.round(minutes) % 60, hours && (out = zero(hours) + ":"), out += zero(minutes) + ":" + zero(seconds);
            }
            return out;
        },
        onDownload: function() {
            if (this.src) if (this.src.startsWith("blob:")) {
                const link = document.createElement("a");
                link.href = this.src, link.download = "audio.oga", link.click();
            } else window.location = session.url(this.src, {
                download: !0
            });
        }
    });
    return AudioPlayer;
})), odoo.define("whatsapp_connector.acrux_chat", (function(require) {
    "use strict";
    require("bus.BusService");
    var core = require("web.core"), AbstractAction = require("web.AbstractAction"), session = require("web.session"), chat = require("whatsapp_connector.chat_classes"), config = require("web.config"), Dialog = require("web.Dialog"), field_utils = require("web.field_utils"), _t = core._t, chat_is_read_resolve = null, chat_is_read = new Promise((r => chat_is_read_resolve = r)), QWeb = core.qweb, AcruxChatAction = AbstractAction.extend({
        contentTemplate: "acrux_chat_action",
        hasControlPanel: !1,
        events: {
            "click .o_acrux_chat_notification .fa-close": "_onCloseNotificationBar",
            "click .o_acrux_chat_request_permission": "_onRequestNotificationPermission",
            "click .o_acrux_chat_item": "selectConversation",
            "click .navbar-toggler.show_thread": "showChatPanel",
            "click .navbar-toggler.show_conv": "showConversationPanel",
            "click .navbar-toggler.show_option": "showRightPanel",
            "click .navbar-toggler.hide_option": "hideRightPanel",
            "click li#tab_partner": "tabPartner",
            "click li#tab_conv_info": "tabConvInfo",
            "click li#tab_conv_states": "tabConvStates",
            "click div#acrux_chat_main_view": "globalClick",
            "click .acrux_order_new_conversation": "reorderConversations"
        },
        init: function(parent, action, options) {
            this._super.apply(this, arguments), this.action_manager = parent, this.model = "acrux.chat.conversation", 
            this.domain = [], this.action = action, this.options = options || {}, this.notification_bar = window.Notification && "default" === window.Notification.permission, 
            this.selected_conversation = this.options.selected_conversation, this.conversation_used_fields = [], 
            this.conversations = this.options.conversations || [], this.default_answers = this.options.default_answers || [], 
            this.context = this.action.context, this.defaultChannelID = this.options.active_id || this.action.context.active_id || this.action.params.default_active_id || "acrux_chat_live_id";
            let widget_options = {
                context: this.context
            };
            this.conversationOrder = this.call("local_storage", "getItem", "chatroomConversationOrder", {
                current: "desc",
                other: "asc"
            }), this.toolbox = new chat.ToolBox(this, widget_options), this.product_search = new chat.ProductSearch(this, widget_options), 
            this.init_conversation = new chat.InitConversation(this, widget_options), this.user_status = new chat.UserStatus(this, widget_options), 
            odoo.debranding_new_name ? this.company_name = odoo.debranding_new_name : this.company_name = "Odoo", 
            this.load_more_message = !1, this.selected_conversation_locked = !1, this.conversation_render_locked = !1;
        },
        startBus: function() {
            let chat_model = this.model;
            this.call("bus_service", "onNotification", this, (notifications => {
                const data = notifications.filter((item => item[0][1] === chat_model));
                this.onNotification(data.map((item => item[1])));
            }));
        },
        willStart: function() {
            return Promise.all([ this._super(), session.is_bound ]).then((() => (this.current_company_id = session.user_context.allowed_company_ids[0], 
            Promise.all([ this.getDefaultAnswers(), this.getRequiredViews(), this.getCurrency(), this.getConversationUsedFields(), session.user_has_group("whatsapp_connector.group_chat_show_user_in_message").then((hasGroup => {
                this.show_user_in_message = hasGroup;
            })) ]))));
        },
        start: function() {
            return this._super().then((() => this._initRender())).then((() => this.startBus())).then((() => {
                if (this.user_status.isActive()) return this.changeStatusView();
            })).then((() => chat_is_read_resolve(this)));
        },
        _initRender: function() {
            return this._buildJqueryObjects(), this.$chat_message.on("scroll", (event => {
                if (0 == $(event.target).scrollTop() && this.selected_conversation && this.load_more_message) return this.selected_conversation.syncMoreMessage();
            })), core.bus.on("acrux_chat_msg_seen", this, this.chatMessageSeen), config.device.isMobile && this.showConversationPanel(), 
            this.$(".o_sidebar_right").find("ul.nav.nav-tabs").find("li > a").click((e => {
                this._getMaximizeTabs().includes($(e.target).attr("href")) || this.product_search.maximize();
            })), this.onResizeWindow(), this.onWindowShow(), Promise.all([ this.toolbox.appendTo(this.$chat_content), this.product_search.prependTo(this.$sidebar_right), this.init_conversation.appendTo(this.$tab_init_chat), this.user_status.appendTo(this.$sidebar_left.find(".o_acrux_group").first()), this.showDefaultAnswers(), this.addChatroomPopover() ]).then((() => {
                this.$chat_title = this.$(".o_conv_title"), this.toolbox.do_hide(), this.renderOrderIcon(this.$(".acrux_order_new_conversation")[0], "asc", this.conversationOrder.other), 
                this.renderOrderIcon(this.$(".acrux_order_current_conversation")[0], "asc", this.conversationOrder.current);
            }));
        },
        _buildJqueryObjects: function() {
            this.$chat_content = this.$(".o_acrux_chat_content"), this.$sidebar_left = this.$(".o_sidebar_left"), 
            this.$sidebar_right = this.$(".o_sidebar_right"), this.$first_main_tab = this.$(".o_sidebar_right").find("ul.nav.nav-tabs").children("li").first().find("a"), 
            this.$first_content_tab = this.$(".o_sidebar_right #acrux_tabs .tab-content div").first(), 
            this.$chat_message = this.$("div.o_chat_thread"), this.$current_chats = this.$(".o_acrux_chat_items.o_current_chats"), 
            this.$new_chats = this.$(".o_acrux_chat_items.o_new_chats"), this.$chat_title = this.$(".o_conv_title"), 
            this.$tab_default_answer = this.$("div#tab_content_default_answer > div.o_group"), 
            this.$tab_init_chat = this.$("div#tab_content_init_chat"), this.$tab_content_partner = this.$("div#tab_content_partner > div.o_group"), 
            this.$tab_content_conv_info = this.$("div#tab_content_conv_info > div.o_group"), 
            this.$tab_content_conv_states = this.$("div#tab_content_conv_states > div.o_group"), 
            this.$first_main_tab.addClass("active"), this.$first_content_tab.addClass("active");
        },
        destroy: function() {
            return this.$el && (this.$chat_message.off("scroll"), core.bus.off("acrux_chat_msg_seen")), 
            this._super.apply(this, arguments);
        },
        do_show: function() {
            this._super.apply(this, arguments), this.action_manager.do_push_state({
                action: this.action.id
            });
        },
        getServerConversation: function() {
            return this._rpc({
                model: this.model,
                method: "search_active_conversation",
                args: [],
                context: this.context
            }).then((result => {
                this.upsertConversation(result);
            }));
        },
        getCurrency: function() {
            return this._rpc({
                model: "res.company",
                method: "read",
                args: [ [ this.current_company_id ], [ "currency_id" ] ],
                context: this.context
            }).then((result => {
                this.currency_id = result[0].currency_id[0], this.currency = session.get_currency(this.currency_id);
            }));
        },
        getDefaultAnswers: function() {
            return this._rpc({
                model: "acrux.chat.default.answer",
                method: "get_for_chatroom",
                args: [],
                context: this.context
            }).then((result => {
                result.forEach((r => this.default_answers.push(new chat.DefaultAnswer(this, r))));
            }));
        },
        getRequiredViews: function() {
            return Promise.all([ this._rpc({
                model: "ir.model.data",
                method: "get_object_reference",
                args: [ "whatsapp_connector", "view_whatsapp_connector_conversation_chatroom_form" ],
                context: this.context
            }).then((result => {
                this.conversation_info_forms = result[1];
            })), this._rpc({
                model: "ir.model.data",
                method: "get_object_reference",
                args: [ "whatsapp_connector", "view_whatsapp_connector_conversation_kanban" ],
                context: this.context
            }).then((result => {
                this.conversation_kanban_view = result[1];
            })) ]);
        },
        getConversationUsedFields: function() {
            return this._rpc({
                model: this.model,
                method: "get_fields_to_read",
                args: [],
                context: this.context
            }).then((result => {
                this.conversation_used_fields = result;
            }));
        },
        upsertConversation: function(convList) {
            const order = this.conversationOrder;
            if (convList) {
                Array.isArray(convList) || (convList = [ convList ]);
                for (const convData of convList) {
                    const conv = this.conversations.find((conv => conv.id == convData.id));
                    if (conv) conv.update(convData); else {
                        const newConv = new chat.Conversation(this, convData);
                        "lock_desc" === ("current" === newConv.status ? order.current : order.other) ? this.conversations.unshift(newConv) : this.conversations.push(newConv);
                    }
                }
            }
            const currentConversations = this.conversations.filter((conv => "current" === conv.status)), notCurrentConversations = this.conversations.filter((conv => "current" !== conv.status)), orderFn = (a, b, criteria) => {
                let out;
                return out = "desc" === criteria ? a.last_activity.isBefore(b.last_activity) : a.last_activity.isAfter(b.last_activity), 
                out ? 1 : -1;
            };
            [ "asc", "desc" ].includes(order.current) && currentConversations.sort(((a, b) => orderFn(a, b, order.current))), 
            [ "asc", "desc" ].includes(order.other) && notCurrentConversations.sort(((a, b) => orderFn(a, b, order.other))), 
            this.conversations = [ ...currentConversations, ...notCurrentConversations ];
        },
        reorderConversations: function(event) {
            const target = event.currentTarget || event.target;
            if (target) {
                const orderChange = {
                    desc: "lock_desc",
                    lock_desc: "asc",
                    asc: "lock_asc",
                    lock_asc: "desc"
                }, fildName = target.classList.contains("acrux_order_new_conversation") ? "other" : "current", lastOrder = this.conversationOrder[fildName], newOrder = this.conversationOrder[fildName] = orderChange[this.conversationOrder[fildName]];
                this.call("local_storage", "setItem", "chatroomConversationOrder", this.conversationOrder), 
                this.upsertConversation(), this.renderOrderIcon(target, lastOrder, newOrder);
            }
            return this.showConversations();
        },
        renderOrderIcon: function(target, lastOrder, newOrder) {
            const orderIcon = {
                desc: "fa-arrow-up",
                asc: "fa-arrow-down",
                lock_desc: "fa-lock",
                lock_asc: "fa-lock"
            }, orderTitle = {
                desc: _t("New Chats Up"),
                asc: _t("New Chats Down"),
                lock_desc: _t("Static Order"),
                lock_asc: _t("Static Order")
            };
            target.querySelector("i").classList.replace(orderIcon[lastOrder], orderIcon[newOrder]), 
            target.title = orderTitle[newOrder];
        },
        format_monetary: function(val) {
            return val = field_utils.format.monetary(val, null, {
                currency: this.currency
            }), $("<span>").html(val).text();
        },
        chatMessageSeen: function() {
            this.selected_conversation && this.selected_conversation.isMine() && this.selected_conversation.messageSeen();
        },
        onResizeWindow: function() {
            let original_device = config.device.isMobile;
            $(window).resize((() => {
                config.device.isMobile != original_device && (config.device.isMobile ? this.showConversationPanel() : (this.showChatPanel(), 
                this.$sidebar_left.removeClass("d-none")), original_device = config.device.isMobile);
            }));
        },
        onWindowShow: function() {
            document.addEventListener("visibilitychange", (function(_ev) {
                document.hidden || core.bus.trigger("acrux_chat_msg_seen");
            }));
        },
        changeStatusView: function() {
            let out = Promise.resolve();
            return this.conversations.forEach((x => x.destroy())), this.conversations = [], 
            this.user_status.isActive() && (out = this.getServerConversation().then((() => this.showConversations()))), 
            this.selected_conversation = null, this.toolbox.do_hide(), this.tabsClear(), out;
        },
        showConversations: function() {
            let defs = [];
            return this.$new_chats.html(""), defs = [ ...defs, ...this.getNewConversation().map((x => this.renderNewConversation(x))) ], 
            this.$current_chats.html(""), defs = [ ...defs, ...this.getCurrentConversation().map((x => this.renderCurrentConversation(x))) ], 
            this.shouldShowAllConversations() && (defs = [ ...defs, ...this.getDoneConversation().map((x => this.renderNewConversation(x))) ], 
            defs = [ ...defs, ...this.getCurrentNotMineConversation().map((x => this.renderNewConversation(x))) ]), 
            Promise.all(defs);
        },
        renderNewConversation: function(conv) {
            return conv.appendTo(this.$new_chats);
        },
        renderCurrentConversation: function(conv) {
            return conv.appendTo(this.$current_chats);
        },
        showConversationPanel: function() {
            config.device.isMobile && this.$chat_content.hide(), this.$sidebar_left.removeClass("d-none");
        },
        showChatPanel: function() {
            config.device.isMobile && this.$sidebar_left.addClass("d-none"), this.$chat_content.show();
        },
        showRightPanel: function() {
            config.device.isMobile || this.$sidebar_left.addClass("d-none"), this.$chat_content.hide();
        },
        hideRightPanel: function() {
            config.device.isMobile || this.$sidebar_left.removeClass("d-none"), this.$chat_content.show();
        },
        showDefaultAnswers: async function() {
            const target = this.$("div.default_table_answers");
            return this._showDefaultAnswers(this.default_answers, target);
        },
        _showDefaultAnswers: async function(default_answers, target) {
            let index = 0, row = $('<div class="row-default">'), padding = default_answers.length % 2;
            padding = 2 - padding;
            let func_default_answer = arr => {
                if (index < arr.length) return arr[index].appendTo(row).then((() => (++index, index % 2 == 0 && (row.appendTo(target), 
                row = $('<div class="row-default">')), func_default_answer(arr))));
                if (padding) {
                    for (let i = 0; i < padding; ++i) $('<div class="cell-default">').appendTo(row);
                    row.appendTo(target);
                }
                return Promise.resolve();
            };
            return func_default_answer(default_answers);
        },
        getNewConversation: function() {
            return this.conversations.filter((x => "new" == x.status));
        },
        getCurrentConversation: function() {
            return this.conversations.filter((x => x.isMine()));
        },
        getDoneConversation: function() {
            return this.conversations.filter((x => "done" == x.status));
        },
        getCurrentNotMineConversation: function() {
            return this.conversations.filter((x => "current" == x.status && !x.isMine()));
        },
        shouldShowAllConversations: function() {
            return !1;
        },
        lockRenderConversation: async function() {
            return new Promise((res => {
                this.conversation_render_locked ? setTimeout((async () => {
                    await this.lockRenderConversation(), res((() => {
                        this.conversation_render_locked = !1;
                    }));
                }), 50) : (this.conversation_render_locked = !0, res((() => {
                    this.conversation_render_locked = !1;
                })));
            }));
        },
        lockSelectConversation: async function() {
            return new Promise((res => {
                this.selected_conversation_locked ? setTimeout((async () => {
                    await this.lockSelectConversation(), res((() => {
                        this.selected_conversation_locked = !1;
                    }));
                }), 50) : (this.selected_conversation_locked = !0, res((() => {
                    this.selected_conversation_locked = !1;
                })));
            }));
        },
        selectConversation: function(event) {
            const conversation_id = $(event.currentTarget).data("id");
            return this.lockSelectConversation().then((unlock => {
                let finish = Promise.resolve();
                const conv_id = this.conversations.find((x => x.id == conversation_id));
                return conv_id && this.selected_conversation != conv_id && (this.selected_conversation && this.selected_conversation.$el.removeClass("active"), 
                this.selected_conversation = conv_id, this.load_more_message = !1, finish = this.selected_conversation.showMessages(), 
                finish.then((() => this.load_more_message = !0)), this.tabsClear()), finish.then((() => {
                    this.toolbox.do_show(), this.toolbox.$input.focus(), this.showChatPanel();
                })).finally(unlock);
            }));
        },
        setNewPartner: function(partner_id) {
            if (partner_id && partner_id.data && partner_id.data.id && partner_id.data.id != this.selected_conversation.res_partner_id[0]) if ((partner_id = Object.assign({}, partner_id)).data.name = partner_id.data.display_name, 
            this.res_partner_form) this.res_partner_form.recordChange(partner_id).then((() => {
                this.saveDestroyWidget("res_partner_form");
            })); else {
                let tmp_widget = new chat.ResPartnerForm(this, {});
                tmp_widget.recordChange(partner_id).then((() => {
                    tmp_widget.destroy();
                }));
            }
        },
        tabPartner: function(_event, data) {
            let out = Promise.reject();
            if (this.selected_conversation) {
                let partner_id = this.selected_conversation.res_partner_id;
                this.saveDestroyWidget("res_partner_form");
                let options = {
                    context: _.extend({
                        conversation_id: this.selected_conversation.id
                    }, this.context),
                    res_partner: partner_id,
                    action_manager: this.action_manager,
                    searchButton: !0,
                    searchButtonString: _t("Match with Existing Partner")
                };
                this.res_partner_form = new chat.ResPartnerForm(this, options), this.$tab_content_partner.empty(), 
                out = this.res_partner_form.appendTo(this.$tab_content_partner);
            } else this.$tab_content_partner.html(QWeb.render("acrux_empty_tab"));
            return out.then((() => data && data.resolve && data.resolve())), out.catch((() => data && data.reject && data.reject())), 
            out;
        },
        tabConvInfo: function(_event, data) {
            let out = Promise.reject();
            if (this.selected_conversation) if (this.selected_conversation.isMine()) {
                let conv_info = [ this.selected_conversation.id, this.selected_conversation.name ];
                this.saveDestroyWidget("conv_info_form");
                let options = {
                    context: this.context,
                    conv_info,
                    action_manager: this.action_manager,
                    form_name: this.conversation_info_forms
                };
                this.conv_info_form = new chat.ConversationForm(this, options), this.$tab_content_conv_info.empty(), 
                out = this.conv_info_form.appendTo(this.$tab_content_conv_info);
            } else this.$tab_content_conv_info.html(QWeb.render("acrux_empty_tab", {
                notYourConv: !0
            })); else this.$tab_content_conv_info.html(QWeb.render("acrux_empty_tab"));
            return out.then((() => data && data.resolve && data.resolve())), out.catch((() => data && data.reject && data.reject())), 
            out;
        },
        tabConvStates: function(_event, data) {
            let out = Promise.reject();
            this.saveDestroyWidget("conv_states_kanban");
            let options = {
                context: this.context,
                action_manager: this.action_manager,
                form_name: this.conversation_kanban_view
            };
            return this.conv_states_kanban = new chat.ConversationKanban(this, options), this.$tab_content_conv_states.empty(), 
            out = this.conv_states_kanban.appendTo(this.$tab_content_conv_states), out.then((() => data && data.resolve && data.resolve())), 
            out.catch((() => data && data.reject && data.reject())), out;
        },
        addChatroomPopover: function() {
            let emoji_html = QWeb.render("acrux_chat_popover");
            return this.$el.popover({
                trigger: "manual",
                animation: !0,
                html: !0,
                title: function() {
                    return "nada";
                },
                container: this.$("div#acrux_chat_main_view"),
                placement: "left",
                content: this.popoverOptions.bind(this),
                template: emoji_html
            }).on("show.bs.popover", (() => {
                setTimeout(this.fixPopoverPosition.bind(this), 10);
            })), $(window).resize(this.fixPopoverPosition.bind(this)), Promise.resolve();
        },
        fixPopoverPosition: function() {
            if (!this.popoverOption) return "";
            let popover = this.$(".o_acrux_chat_popover");
            if (popover.length) {
                let popover_data = popover[0].getBoundingClientRect(), msg_data = this.popoverOption.event.currentTarget.getBoundingClientRect(), position = {
                    top: msg_data.top + msg_data.height,
                    left: msg_data.left + msg_data.width
                };
                position.top + popover_data.height > window.visualViewport.height && (position.top = msg_data.top - msg_data.height - popover_data.height), 
                position.left + popover_data.width > window.visualViewport.width && (position.left = msg_data.left - msg_data.width - popover_data.width), 
                popover.offset(position), popover.css("z-index", 100);
            }
        },
        popoverOptions: function() {
            return "";
        },
        globalClick: function(e) {
            const ignoreIdList = this.globalClickIgnoreIdList();
            this.$("div.popover").each((function() {
                $(this).is(e.target) || 0 !== $(this).has(e.target).length || 0 !== $(".popover").has(e.target).length || ignoreIdList.includes($(e.target).attr("id")) || $(this).popover("hide");
            }));
        },
        globalClickIgnoreIdList: function() {
            return [ "o_chat_button_emoji" ];
        },
        onNotification: function(data) {
            data && data.forEach((d => this.notifactionProcessor(d)));
        },
        notifactionProcessor: function(data) {
            data.delete_conversation && this.user_status.isActive() && data.delete_conversation.forEach((m => this.onDeleteConversation(m))), 
            data.delete_taken_conversation && this.user_status.isActive() && data.delete_taken_conversation.forEach((m => this.onDeleteTakenConversation(m))), 
            data.new_messages && this.user_status.isActive() && data.new_messages.forEach((m => this.onNewMessage(m))), 
            data.init_conversation && this.user_status.isActive() && data.init_conversation.forEach((m => this.onInitConversation(m))), 
            data.change_status && data.change_status.forEach((m => this.onChangeStatus(m))), 
            data.update_conversation && this.user_status.isActive() && data.update_conversation.forEach((m => this.onUpdateConversation(m))), 
            data.assign_conversation && this.user_status.isActive() && data.assign_conversation.forEach((m => this.addConversation(m))), 
            data.error_messages && this.user_status.isActive() && this.onErrorMessages(data.error_messages);
        },
        onNewMessage: async function(d) {
            let conv = null;
            if (("new" == d.status || this.conversations.find((x => x.id === d.id))) && (this.upsertConversation(d), 
            conv = this.conversations.find((x => x.id === d.id)), await conv.addClientMessage(d.messages), 
            await this.showConversations(), conv && (conv.showMessageCount(), this.selected_conversation === conv && !document.hidden && conv.isMine() && conv.messageSeen(), 
            document.hidden && ("all" === d.desk_notify || "mines" === d.desk_notify && conv.agent_id && conv.agent_id[0] == session.uid)))) {
                const msg = d.messages.filter((x => !x.from_me));
                msg && msg.length && this.call("bus_service", "sendNotification", _t("New messages from ") + conv.name);
            }
            return conv;
        },
        onUpdateConversation: function(d) {
            let conv = this.conversations.find((x => x.id === d.id)), def_out = Promise.resolve(conv);
            if (conv) {
                let old_partner = conv.res_partner_id;
                this.upsertConversation(d), def_out = this.showConversations().then((() => conv)), 
                this.$tab_content_partner.parent().hasClass("active") && this.selected_conversation == conv && (conv.res_partner_id[0] != old_partner[0] ? this.tabPartner({
                    currentTarget: !1
                }) : this.res_partner_form.acrux_form_widget.reload()), this.$tab_content_conv_info.parent().hasClass("active") && this.conv_info_form.acrux_form_widget.reload();
            }
            return this.$tab_content_conv_states.parent().hasClass("active") && this.conv_states_kanban.acrux_form_widget.reload(), 
            def_out;
        },
        onDeleteConversation: function(conv_data) {
            let out;
            return out = conv_data.agent_id[0] != session.uid ? this.deleteConversation(conv_data) : Promise.resolve(), 
            out;
        },
        onDeleteTakenConversation: function(conv_data) {
            let out;
            return out = conv_data.agent_id[0] == session.uid ? this.deleteConversation(conv_data) : Promise.resolve(), 
            out;
        },
        onInitConversation: function(conv_data) {
            return this.addConversation(conv_data).then((conv => {
                let out = Promise.resolve(conv);
                return this.showConversationPanel(), conv?.el && (out = this.selectConversation({
                    currentTarget: conv.el
                }).then((() => conv))), out;
            }));
        },
        addConversation: function(conv_data) {
            this.upsertConversation(conv_data);
            const conv = this.conversations.find((x => x.id === conv_data.id));
            return this.selected_conversation && this.selected_conversation.id != conv.id && conv.setMessages(conv_data.messages), 
            this.showConversations().then((() => conv));
        },
        onChangeStatus: function(data) {
            data.agent_id[0] == session.uid && (this.user_status.changeStatusNotify(data), this.toolbox.changeStatusNotify(data), 
            this.changeStatusView());
        },
        onErrorMessages: function(error_messages) {
            let message_found, conv_to_show, msg_to_show, conv_found = [], show_conv = !0;
            if (error_messages.forEach((conv_data => {
                let conv = this.conversations.find((x => x.id == conv_data.id));
                conv && (conv.update(conv_data), message_found = conv.setMessageError(conv_data.messages), 
                conv_found.push(conv), this.selected_conversation && this.selected_conversation.id == conv.id ? show_conv = !1 : "current" == conv.status && (conv_to_show = conv, 
                message_found.length && (msg_to_show = message_found[0])));
            })), conv_found.length) {
                let msg = _t("Error in conversation with ");
                conv_found.forEach(((val, index) => {
                    index && (msg += ", "), msg += val.name;
                })), Dialog.alert(this, msg, {
                    confirm_callback: () => {
                        show_conv && conv_to_show && this.selectConversation({
                            currentTarget: conv_to_show.el
                        }).then((() => {
                            msg_to_show.el.scrollIntoView({
                                block: "nearest",
                                inline: "start"
                            });
                        }));
                    }
                });
            }
        },
        deleteConversation: function(conv_data) {
            let conv = this.conversations.find((x => x.id == conv_data.id));
            return this.conversations = this.conversations.filter((x => x.id != conv_data.id)), 
            conv && (conv == this.selected_conversation ? this.removeSelectedConversation() : conv.destroy()), 
            Promise.resolve(conv);
        },
        removeSelectedConversation: function() {
            this.selected_conversation && (this.conversations = this.conversations.filter((x => x.id != this.selected_conversation.id)), 
            this.selected_conversation.destroy(), this.selected_conversation = null), this.toolbox.do_hide(), 
            this.tabsClear();
        },
        tabNeedReload: function() {
            return !this.$tab_default_answer.parent().hasClass("active") && !this.$tab_init_chat.hasClass("active") && !this.$tab_content_conv_states.parent().hasClass("active");
        },
        saveDestroyWidget: function(name) {
            if (this && this[name]) {
                let tmp_form = this[name];
                this[name] = null, tmp_form.destroy();
            }
        },
        tabsClear: function() {
            this.tabNeedReload() && this.$first_main_tab.trigger("click"), this.saveDestroyWidget("res_partner_form"), 
            this.saveDestroyWidget("conv_info_form");
        },
        _onCloseNotificationBar: function() {
            this.$(".o_acrux_chat_notification").slideUp();
        },
        _onRequestNotificationPermission: function(event) {
            event.preventDefault(), this.$(".o_acrux_chat_notification").slideUp();
            var def = window.Notification && window.Notification.requestPermission();
            def && def.then((value => {
                "granted" !== value ? this.call("bus_service", "sendNotification", _t("Permission denied"), this.company_name + _t(" will not have the permission to send native notifications on this device.")) : this.call("bus_service", "sendNotification", _t("Permission granted"), this.company_name + _t(" has now the permission to send you native notifications on this device."));
            }));
        },
        _getMaximizeTabs: function() {
            return [ "#tab_content_partner", "#tab_content_conv_info" ];
        }
    });
    return core.action_registry.add("acrux.chat.create_new_conversation", (function(self, action, _options) {
        self.do_action({
            type: "ir.actions.act_window_close"
        }).then((() => {
            const controller = self.getCurrentController();
            controller && controller.widget.init_conversation.createConversation({
                context: action.context
            });
        }));
    })), core.action_registry.add("acrux.chat.conversation_tag", AcruxChatAction), {
        AcruxChatAction,
        is_ready: chat_is_read
    };
})), odoo.define("whatsapp_connector.chat_classes", (function(require) {
    "use strict";
    return {
        Message: require("whatsapp_connector.message"),
        Conversation: require("whatsapp_connector.conversation"),
        ToolBox: require("whatsapp_connector.toolbox"),
        DefaultAnswer: require("whatsapp_connector.default_answer"),
        ProductSearch: require("whatsapp_connector.product_search"),
        InitConversation: require("whatsapp_connector.init_conversation"),
        UserStatus: require("whatsapp_connector.user_status"),
        ResPartnerForm: require("whatsapp_connector.res_partner"),
        ConversationForm: require("whatsapp_connector.conversation_form"),
        ConversationKanban: require("whatsapp_connector.conversation_kanban")
    };
})), odoo.define("whatsapp_connector.conversation", (function(require) {
    "use strict";
    var core = require("web.core"), Widget = require("web.Widget"), Message = require("whatsapp_connector.message"), session = require("web.session"), framework = require("web.framework");
    const field_utils = require("web.field_utils");
    var QWeb = core.qweb, Conversation = Widget.extend({
        template: "acrux_chat_conversation",
        events: {
            "click .acrux_close_conv": "close"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({
                message_from_chatroom: !0
            }, this.parent.context || {}, this.options.context), this.session = session, this.update(this.options), 
            this.setMessages(this.options.messages);
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        update: function(options) {
            this.id = options.id || 0, this.name = options.name || "", this.number_format = options.number_format, 
            this.status = options.status || "new", this.border_color = options.border_color || "#FFFFFF", 
            this.image_url = options.image_url, this.team_id = options.team_id || [ !1, "" ], 
            this.res_partner_id = options.res_partner_id || [ !1, "" ], this.agent_id = options.agent_id || [ !1, "" ], 
            this.connector_id = options.connector_id || [ !1, "" ], this.connector_type = options.connector_type || "", 
            this.show_icon = options.show_icon || !1, this.allow_signing = options.allow_signing || !1, 
            this.assigned = options.assigned || !1, options.last_activity && (options.last_activity instanceof String || "string" == typeof options.last_activity) ? this.last_activity = field_utils.parse.datetime(options.last_activity) : this.last_activity = moment(), 
            this.updateMessages(options.messages || []);
        },
        _initRender: function() {
            return this.$number_new_msg = this.$(".o_number_new_msg"), this.$(".acrux_image_perfil").css("box-shadow", "0 0 5px 2px " + this.border_color), 
            this.$number_new_msg.addClass("o_hidden"), this.parent.selected_conversation == this && this.$el.addClass("active"), 
            this.$agent = this.$(".o_acrux_agent"), this.showMessageCount(), Promise.resolve();
        },
        destroy: function() {
            return this.parent.selected_conversation && this == this.parent.selected_conversation && (this.parent.$chat_title.html(""), 
            this.parent.$chat_message.html("")), this._super.apply(this, arguments);
        },
        setMessages: function(messages) {
            let out = Promise.resolve();
            return this.messages_ids = new Set, this.messages && (this.messages.forEach((x => x.destroy())), 
            this.parent.$chat_message.html("")), messages && messages instanceof Array && messages.length > 0 ? messages[0] instanceof Message ? (this.messages = messages, 
            this.messages.forEach((x => this.messages_ids.add(x.id)))) : (this.messages = [], 
            out = this.addClientMessage(messages)) : this.messages = [], out;
        },
        addCompanyMessage: function(msg) {
            let out = Promise.resolve();
            return this.messages_ids.has(msg.id) || (out = this.parent.lockRenderConversation().then((unlock => (this.messages.length ? this.messages[this.messages.length - 1].getDate() != msg.getDate() && this.parent.$chat_message.append(msg.getDateTmpl()) : this.parent.$chat_message.append(msg.getDateTmpl()), 
            this.messages.push(msg), msg.appendTo(this.parent.$chat_message).then((() => {
                this.needScroll() && this.scrollConversation();
            })).finally(unlock))))), out;
        },
        showMessages: function() {
            return this.parent.lockRenderConversation().then((unlock => {
                let def, conv_title = QWeb.render("acrux_chat_conv_title", {
                    conversation: this
                }), $el = this.parent.$chat_message;
                return this.parent.$chat_title.html(conv_title), $el.empty(), def = this.messages.length ? this._syncLoop(0, this.messages, -1, $el).then((() => {
                    setTimeout((() => this.scrollConversation()), 200);
                })) : Promise.resolve(), this.$el.addClass("active"), this.isMine() && this.messageSeen(), 
                this.assigned = !1, this.$(".o_acrux_assigned_conv").remove(), def.finally(unlock);
            }));
        },
        addClientMessage: function(messages) {
            let show = this.parent.selected_conversation && this.parent.selected_conversation.id == this.id, def = Promise.resolve();
            if (messages) {
                if (messages = (messages = messages.map((r => new Message(this, r)))).filter((r => !this.messages_ids.has(r.id))), 
                show && messages.length) {
                    const $el = this.parent.$chat_message;
                    def = this.parent.lockRenderConversation().then((unlock => this._syncLoop(0, messages, this.messages.length - 1, $el).then((() => {
                        this.needScroll() && this.scrollConversation();
                    })).finally(unlock)));
                }
                messages.forEach((r => {
                    this.messages.push(r), this.messages_ids.add(r.id);
                }));
            }
            return def;
        },
        addExtraClientMessage: function(messages) {
            let show = this.parent.selected_conversation && this.parent.selected_conversation.id == this.id, def = Promise.resolve(), $el = $("<div>");
            return messages && (messages = (messages = messages.map((r => new Message(this, r)))).filter((r => !this.messages_ids.has(r.id))), 
            show && (def = this.parent.lockRenderConversation().then((unlock => (framework.blockUI(), 
            this._syncLoop(0, messages, -1, $el).then((() => {
                if (messages.length) {
                    let first_msg, last_msg = messages[messages.length - 1];
                    this.messages.length && (first_msg = this.messages[0], first_msg.getDate() == last_msg.getDate() && first_msg.$el.prev().hasClass("o_acrux_date") && first_msg.$el.prev().remove()), 
                    this.parent.$chat_message.prepend($el.contents()), last_msg.$el[0].scrollIntoView({
                        block: "nearest",
                        inline: "start"
                    });
                }
            })).finally((() => {
                framework.unblockUI(), unlock();
            })))))), messages.length && def.then((() => {
                messages.forEach((r => this.messages_ids.add(r.id))), this.messages = messages.concat(this.messages);
            }))), def;
        },
        _syncLoop: function(i, arr, last_index, $el) {
            let out;
            return out = i < arr.length ? this._syncShow(i, arr, last_index, $el).then((() => this._syncLoop(i + 1, arr, last_index, $el))) : Promise.resolve(), 
            out;
        },
        _syncShow: function(i, arr, last_index, $el) {
            let out_def, r = arr[i];
            return i ? (r.getDate() != arr[i - 1].getDate() && $el.append(r.getDateTmpl()), 
            out_def = r.appendTo($el)) : (last_index >= 0 ? this.messages[last_index].getDate() != r.getDate() && $el.append(r.getDateTmpl()) : $el.append(r.getDateTmpl()), 
            out_def = r.appendTo($el)), out_def;
        },
        setMessageError: function(messages) {
            let out = [];
            if (messages && this.messages.length) {
                let show = this.parent.selected_conversation && this.parent.selected_conversation.id == this.id;
                messages.forEach((r => {
                    let msg = this.messages.find((x => x.id == r.id));
                    msg && (out.push(msg), msg.setErrorMessage(r.error_msg), show && msg.replace());
                }));
            }
            return out;
        },
        updateMessages: function(messages) {
            if (messages && this.messages && this.messages.length) {
                let show = this.parent.selected_conversation && this.parent.selected_conversation.id == this.id;
                messages.forEach((r => {
                    let msg = this.messages.find((x => x.id == r.id));
                    msg && (msg.update(r), show && msg.replace());
                }));
            }
        },
        syncMoreMessage: function() {
            this.messages.length >= 22 && this._rpc({
                model: "acrux.chat.conversation",
                method: "build_dict",
                args: [ [ this.id ], 22, this.messages.length ],
                context: this.context
            }).then((result => {
                this.addExtraClientMessage(result[0].messages);
            }));
        },
        needScroll: function() {
            return this.calculateScrollPosition() >= .75;
        },
        calculateScrollPosition: function() {
            let scroll_postion = this.parent.$chat_message.height();
            return scroll_postion += this.parent.$chat_message.scrollTop(), scroll_postion / this.parent.$chat_message[0].scrollHeight;
        },
        scrollConversation: function() {
            if (this.parent.$chat_message.children().length) {
                let element = this.parent.$chat_message.children().last();
                element.children().length && (element = element.children().last()), element[0].scrollIntoView({
                    block: "nearest",
                    inline: "start"
                });
            }
        },
        calculateMessageCount: function() {
            const messages = this.messages.filter((msg => !msg.ttype.startsWith("info")));
            let lastIndexOf;
            return lastIndexOf = Array.prototype.findLastIndex ? messages.findLastIndex((msg => msg.from_me)) : messages.map((msg => msg.from_me)).lastIndexOf(!0), 
            messages.length - (lastIndexOf + 1);
        },
        showMessageCount: function() {
            const count_new_msg = this.calculateMessageCount();
            this.$number_new_msg && [ "new", "current" ].includes(this.status) && (count_new_msg > 0 ? (this.$number_new_msg.text(count_new_msg), 
            this.$number_new_msg.removeClass("o_hidden")) : this.$number_new_msg.addClass("o_hidden"));
        },
        createMessage: function(options) {
            return this.parent.lockSelectConversation().then((unlock => {
                let msg = new Message(this, options), json_data = msg.export_to_vals();
                return options.custom_field && (json_data[options.custom_field] = !0), this._rpc({
                    model: "acrux.chat.conversation",
                    method: "send_message",
                    args: [ [ this.id ], json_data ],
                    context: this.context
                }).then((result => (msg.update(result[0]), this.last_activity = moment(), this.addCompanyMessage(msg).then((() => msg))))).finally(unlock);
            }));
        },
        messageSeen: function() {
            this._rpc({
                model: "acrux.chat.conversation",
                method: "conversation_send_read",
                args: [ [ this.id ] ],
                context: this.context
            }, {
                shadow: !0
            }).catch((() => {}));
        },
        isMine: function() {
            return "current" == this.status && this.agent_id && this.agent_id[0] == session.uid;
        },
        getIconClass: function() {
            let out = "";
            return [ "apichat.io", "chatapi", "gupshup" ].includes(this.connector_type) && (out = "acrux_whatsapp"), 
            out;
        },
        close: function() {
            let prom = Promise.resolve();
            session.chatroom_release_conv_on_close && (prom = this._rpc({
                model: "acrux.chat.conversation",
                method: "close_from_ui",
                args: [ [ this.id ] ],
                context: this.context
            }, {
                shadow: !0
            }).catch((() => {}))), prom.finally((() => {
                this.parent.deleteConversation({
                    id: this.id
                });
            }));
        }
    });
    return Conversation;
})), odoo.define("whatsapp_connector.conversation_form", (function(require) {
    "use strict";
    var ConversationForm = require("whatsapp_connector.form_view").extend({
        init: function(parent, options) {
            options && (options.model = "acrux.chat.conversation", options.record = options.conv_info), 
            this._super.apply(this, arguments), this.parent = parent;
        },
        start: function() {
            return this._super().then((() => this.parent.product_search.minimize()));
        },
        recordSaved: function(record) {
            return this._super(record).then((() => this._rpc({
                model: this.parent.model,
                method: "update_conversation_bus",
                args: [ [ this.parent.selected_conversation.id ] ],
                context: this.context
            })));
        }
    });
    return ConversationForm;
})), odoo.define("whatsapp_connector.conversation_kanban", (function(require) {
    "use strict";
    var ConversationKanban = require("whatsapp_connector.kanban_view").extend({
        init: function(parent, options) {
            options && (options.model = "acrux.chat.conversation"), this._super.apply(this, arguments), 
            this.parent = parent, this.context = _.extend({}, this.context);
        },
        start: function() {
            return this._super().then((() => this.parent.product_search.minimize()));
        },
        _showAcruxFormView: function() {
            return this._super().then((() => {
                this.acrux_form_widget._onOpenRecord = this._onOpenRecord.bind(this);
            }));
        },
        _onOpenRecord: function(ev) {
            const record = this.acrux_form_widget.model.get(ev.data.id, {
                raw: !0
            });
            this._rpc({
                model: this.parent.model,
                method: "build_dict",
                args: [ [ record.data.id ], 22 ],
                context: this.context
            }).then((result => this.parent.onInitConversation(result[0])));
        },
        _resequenceRecords: function(data) {
            return this._super(data).then((out => {
                if (data?.record?.recordData?.id) {
                    const backOut = out;
                    out = this._rpc({
                        model: this.parent.model,
                        method: "update_conversation_bus",
                        args: [ [ data.record.recordData.id ] ],
                        context: this.context
                    }).then((() => backOut));
                }
                return out;
            }));
        }
    });
    return ConversationKanban;
})), odoo.define("whatsapp_connector.default_answer", (function(require) {
    "use strict";
    var Widget = require("web.Widget"), _t = require("web.core")._t, DefaultAnswer = Widget.extend({
        template: "acrux_chat_default_answer",
        events: {
            "click .o_acrux_chat_default_answer_send": "sendAnswer"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.name = this.options.name || "", 
            this.sequence = this.options.sequence || "", this.id = this.options.id || "", this.text = this.options.text || "", 
            this.ttype = this.options.ttype || "", this.res_model = this.options.res_model, 
            this.res_id = this.options.res_id, this.buttons = this.options.button_ids || [], 
            this.chat_list_id = this.options.chat_list_id || [ null, "" ];
        },
        sendAnswer: async function(event) {
            event && (event.preventDefault(), event.stopPropagation(), $(event.target).prop("disabled", !0));
            let out = Promise.resolve();
            if (this.parent.selected_conversation && this.parent.selected_conversation.isMine()) {
                let text, ttype = this.ttype;
                "code" == this.ttype ? (ttype = "text", text = await this._rpc({
                    model: "acrux.chat.default.answer",
                    method: "eval_answer",
                    args: [ [ this.id ], this.parent.selected_conversation.id ],
                    context: this.context
                })) : text = this.text && "" != this.text ? this.text : this.name;
                const options = {
                    from_me: !0,
                    text,
                    ttype,
                    res_model: this.res_model,
                    res_id: this.res_id,
                    button_ids: this.buttons.map((btn => {
                        const btn2 = {
                            ...btn
                        };
                        return delete btn2.id, btn2;
                    })),
                    chat_list_id: this.chat_list_id
                };
                out = this.parent.selected_conversation.createMessage(options), out.then((() => this.parent.showConversationPanel())), 
                out.then((() => this.parent.showChatPanel()));
            } else this.call("crash_manager", "show_warning", {
                message: _t("You must select a conversation.")
            });
            return out.finally((() => {
                event && $(event.target).prop("disabled", !1);
            }));
        }
    });
    return DefaultAnswer;
})), odoo.define("whatsapp_connector.emojis", (function() {
    "use strict";
    return {
        data: [ "😁", "😂", "😃", "😄", "😅", "😆", "😇", "😈", "😉", "😊", "😋", "😌", "😍", "😎", "😏", "😐", "😑", "😒", "😓", "😔", "😕", "😖", "😗", "😘", "😙", "😚", "😛", "😜", "😝", "😞", "😟", "😠", "😡", "😢", "😣", "😤", "😥", "😦", "😧", "😨", "😩", "😪", "😫", "😬", "😭", "😮", "😯", "😰", "😱", "😲", "😳", "😴", "😵", "😶", "😷", "😸", "😹", "😺", "😻", "😼", "😽", "😾", "😿", "🙀", "🙁", "🙂", "🙃", "🙄", "🙅", "🙆", "🙇", "🙈", "🙉", "🙊", "🙋", "🙌", "🙍", "🙎", "🙏", "👀", "👁", "👂", "👃", "👄", "👅", "👆", "👇", "👈", "👉", "👊", "👋", "👌", "👍", "👎", "👏", "👐", "👦", "👧", "👨", "👩", "👪", "👫", "👬", "👭", "👺", "👻", "👼", "👽", "👾", "👿", "💀", "💁", "😀", "❤️", "💓", "💔", "💘", "💩", "💪", "💵", "🐞", "🐻", "🐌", "🐗", "🍀", "🌹", "🔥", "☀️", "⛅️", "🌈", "☁️", "⚡️", "⭐️", "🍪", "🍕", "🍔", "🍟", "🎂", "🍰", "☕️", "🍌", "🍣", "🍙", "🍺", "🍷", "🍸", "🍹", "🍻", "🎉", "🏆", "🔑", "📌", "📯", "🎵", "🎺", "🎸", "🏃", "🚲", "⚽️", "🏈", "🎱", "🎬", "🎤", "🧀" ]
    };
})), odoo.define("whatsapp_connector.form_view", (function(require) {
    "use strict";
    var Widget = require("web.Widget"), dom = require("web.dom"), _t = require("web.core")._t, FormView = Widget.extend({
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.parent.selected_conversation && (this.context.default_conversation_id = this.parent.selected_conversation.id), 
            this.model = this.options.model, this.form_name = this.options.form_name, this.record = this.options.record, 
            this.action_manager = this.options.action_manager, this.acrux_form_widget = null, 
            this.action = {}, this.created_date = new Date;
        },
        start: function() {
            return this._super().then((() => this.do_action(this.getDoActionDict(), this.getOptions()).then((action => (this.action = action, 
            this.action.controllers.form && this.action.controllers.form.then((r => {
                this.acrux_form_widget = r.widget, this.acrux_form_widget.acrux_widget = this, this._showAcruxFormView();
            })), action)))));
        },
        destroy: function() {
            return this.$el && this.action_manager._removeAction(this.action.jsID), this._super();
        },
        getDoActionDict: function() {
            return {
                type: "ir.actions.act_window",
                view_type: "form",
                view_mode: "form",
                res_model: this.model,
                views: [ [ this.form_name, "form" ] ],
                target: "inline",
                context: this.context,
                res_id: this.record[0],
                flags: this.getDoActionFlags()
            };
        },
        getDoActionFlags: function() {
            let flags = {
                withControlPanel: !1,
                footerToButtons: !1,
                hasSearchView: !1,
                hasSidebar: !1,
                mode: "edit",
                searchMenuTypes: !1
            };
            return this.record[0] && (flags.mode = "readonly"), flags;
        },
        getOptions: function() {
            return {
                replace_last_action: !1,
                pushState: !1,
                clear_breadcrumbs: !1
            };
        },
        _showAcruxFormView: function() {
            let $buttons = $("<div>");
            return dom.append(this.$el, this.acrux_form_widget.$el, {
                in_DOM: !0,
                callbacks: [ {
                    widget: this
                }, {
                    widget: this.acrux_form_widget
                } ]
            }), this.acrux_form_widget.renderButtons($buttons), $buttons.find(".o_form_button_create").click((() => this._onCreate())), 
            $buttons.find(".o_form_button_edit").click((() => this._onEdit())), this.$el.prepend($buttons.contents()), 
            this.$el.children().first().css("padding", "5px"), this.$el.children().first().css("background", "white"), 
            this.options.searchButton && this._addSearchButton(), this.makeDropable() && this.makeFormDragAndDrop(), 
            Promise.resolve();
        },
        makeDropable: function() {
            return !1;
        },
        acceptDrop: function(_ui) {
            return !1;
        },
        handlerDradDrop: function(_event, _ui) {
            return Promise.resolve();
        },
        makeFormDragAndDrop: function() {
            this.$el.css("padding", "0.5em"), this.$el.droppable({
                drop: (event, ui) => this.handlerDradDrop(event, ui),
                accept: ui => this.acceptDrop(ui),
                activeClass: "drop-active",
                hoverClass: "drop-hover"
            });
        },
        _addSearchButton: function() {
            this.$el.children().first().children().append('<button type="button" class="btn btn-primary o_form_button_search">' + (this.options.searchButtonString || _t("Search")) + "</button>"), 
            this.$el.find(".o_form_button_search").click((() => this._onSearchChatroom()));
        },
        _onSearchChatroom: function() {
            let context = _.extend({
                chatroom_wizard_search: !0
            }, this.context), action = {
                type: "ir.actions.act_window",
                view_type: "form",
                view_mode: "list",
                res_model: this.model,
                domain: this._getOnSearchChatroomDomain(),
                views: [ [ !1, "list" ] ],
                target: "new",
                context,
                flags: {
                    action_buttons: !1,
                    withBreadcrumbs: !1
                }
            };
            return this.do_action(action).then((action => action.controllers.list.then((result => result.widget._chatroomSelectRecord = record => {
                if (record) return this.recordUpdated(record).then((() => this.replace())).then((() => this._onSearchChatroomCallBack(record))).then(record);
            }))));
        },
        _getOnSearchChatroomDomain: function() {
            return [];
        },
        _onSearchChatroomCallBack: function(_record) {
            return Promise.resolve();
        },
        on_attach_callback: function() {
            this.$el.css("height", "100%"), this.$el.css("display", "flex"), this.$el.css("flex-direction", "column"), 
            this.$el.children().first().css("position", "relative"), this.$el.children().first().css("height", "92%"), 
            this.$el.children().first().css("overflow", "auto"), this._fix_attach();
        },
        _fix_attach: function() {
            this.$(".o_form_sheet").eq(0).css("margin", "0"), this.$(".o_form_sheet").eq(0).css("padding", "1em"), 
            this.$(".o_form_sheet").children().first().css("margin", "0"), this.$(".o_chatter").hide(), 
            this.$(".oe_chatter").hide();
        },
        recordUpdated: function(record) {
            return this._fix_attach(), record && record.data && this.record && this.record[0] != record.data.id ? this.recordChange(record) : Promise.resolve();
        },
        recordChange: function(_record) {
            return Promise.resolve();
        },
        recordSaved: function(_record) {
            return Promise.resolve();
        },
        isExpired: function() {
            return new Date - this.created_date >= 108e5;
        },
        isSameRecord: function(record_id) {
            return this.record[0] == record_id;
        },
        _onCreate: function() {
            this.old_record = Array.from(this.record);
        },
        _onEdit: function() {
            this.old_record = null;
        },
        discardChange: function() {
            if (this.old_record) {
                let options = this.getDoActionFlags();
                options.currentId = this.old_record[0], options.ids = [ this.old_record[0] ], options.context = this.context, 
                options.modelName = this.model, options.mode = "readonly", this.acrux_form_widget.reload(options), 
                this.old_record = null;
            }
        },
        update: function(recordId) {
            let out = Promise.resolve();
            return this.acrux_form_widget && (out = this.acrux_form_widget.update({
                currentId: recordId
            })), out;
        },
        _context_hook: function() {}
    });
    return FormView;
})), odoo.define("whatsapp_connector.init_conversation", (function(require) {
    "use strict";
    var core = require("web.core"), Widget = require("web.Widget"), Conversation = require("whatsapp_connector.conversation"), QWeb = core.qweb, _t = core._t, InitConversation = Widget.extend({
        template: "acrux_chat_init_conversation",
        events: {
            "click .o_button_conv_search": "searchConversation",
            "keypress .conv_search": "onKeypress",
            "click .o_button_create_conversation": "createConversation",
            "click .o_acrux_chat_conv_items > .o_conv_record": "selectConversation"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.conv_list = this.options.conv_list || [];
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        _initRender: function() {
            return this.$input_search = this.$("input.conv_search"), this.$conv_items = this.$(".o_acrux_chat_conv_items"), 
            this.renderConvList(), Promise.resolve();
        },
        update: function(new_conv) {
            if (this.conv_list) {
                let conv = this.conv_list.find((x => x.id == new_conv.id));
                if (conv) {
                    let tmp = this.postProcessorResult([ Object.assign({}, new_conv) ])[0];
                    Object.assign(conv, tmp);
                }
            }
        },
        renderConvList: function() {
            let html = QWeb.render("acrux_chat_conv_list", {
                conv_list: this.conv_list
            });
            this.$conv_items.html(html);
        },
        getSearchDomain: function() {
            let val = this.$input_search.val().trim();
            return [ "|", "|", [ "name", "ilike", val ], [ "number_format", "ilike", val ], [ "number", "ilike", val ] ];
        },
        searchConversation: function() {
            let domain, val = this.$input_search.val();
            return domain = val && "" != val.trim() ? this.getSearchDomain() : [], this._rpc({
                model: this.parent.model,
                method: "search_read",
                args: [ domain, this.parent.conversation_used_fields, 0, 100 ],
                context: this.context
            }).then((result => {
                result = this.postProcessorResult(result), this.conv_list = result, this.renderConvList();
            }));
        },
        postProcessorResult: function(result) {
            return result.map((conv => (conv.getIconClass = Conversation.prototype.getIconClass.bind(conv), 
            conv)));
        },
        selectConversation: function(event) {
            let conversation_id = $(event.currentTarget).data("id");
            return this.initAndNotify(conversation_id);
        },
        initAndNotify: function(conversation_id) {
            return this._rpc({
                model: this.parent.model,
                method: "init_and_notify",
                args: [ [ conversation_id ] ],
                context: this.context
            });
        },
        onKeypress: function(event) {
            13 === event.which && $(event.currentTarget).hasClass("conv_search") && (event.preventDefault(), 
            this.searchConversation());
        },
        empty: function() {
            this.$input_search.val(""), this.$conv_items.html(""), this.conv_list = [];
        },
        createConversation: function(event) {
            let context;
            context = event && event.context ? event.context : this.context;
            let action = {
                type: "ir.actions.act_window",
                name: _t("Create"),
                view_type: "form",
                view_mode: "form",
                res_model: this.parent.model,
                views: [ [ !1, "form" ] ],
                target: "new",
                context
            };
            return this.do_action(action).then((action => {
                action.controllers.form.then((result => {
                    result.widget.acrux_init_conv = recordID => {
                        if (recordID) return result.dialog.close(), this.initAndNotify(recordID);
                    };
                }));
            }));
        }
    });
    return InitConversation;
})), odoo.define("whatsapp_connector.kanban_view", (function(require) {
    "use strict";
    var FormView = require("whatsapp_connector.form_view"), dom = require("web.dom"), KanbanView = FormView.extend({
        init: function(parent, options) {
            this._super.apply(this, arguments);
        },
        start: function() {
            return this._super().then((action => (this.action.controllers.kanban && this.action.controllers.kanban.then((r => {
                this.acrux_form_widget = r.widget, this.acrux_form_widget.acrux_widget = this, this._showAcruxFormView();
            })), action)));
        },
        getDoActionDict: function() {
            return {
                type: "ir.actions.act_window",
                view_type: "form",
                view_mode: "kanban",
                res_model: this.model,
                views: [ [ this.form_name, "kanban" ], [ !1, "search" ] ],
                target: "inline",
                context: this.context,
                flags: this.getDoActionFlags()
            };
        },
        getDoActionFlags: function() {
            return {
                withControlPanel: !0,
                footerToButtons: !1,
                hasSearchView: !0,
                hasSidebar: !1,
                searchMenuTypes: [ "filter", "groupBy" ],
                withSearchPanel: !0,
                withSearchBar: !0
            };
        },
        getOptions: function() {
            return {
                replace_last_action: !1,
                pushState: !1,
                clear_breadcrumbs: !1
            };
        },
        _showAcruxFormView: function() {
            return dom.append(this.$el, this.acrux_form_widget.$el, {
                in_DOM: !0,
                callbacks: [ {
                    widget: this
                }, {
                    widget: this.acrux_form_widget
                } ]
            }), Promise.resolve();
        },
        on_attach_callback: function() {
            this.$(".breadcrumb").hide();
        },
        _resequenceRecords: function(_data) {
            return Promise.resolve();
        }
    });
    return KanbanView;
})), odoo.define("whatsapp_connector.message", (function(require) {
    "use strict";
    var DocumentViewer = require("mail.DocumentViewer"), core = require("web.core"), Widget = require("web.Widget"), field_utils = require("web.field_utils"), session = require("web.session"), AudioPlayer = require("whatsapp_connector.audio_player"), MessageMetadata = require("whatsapp_connector.message_metadata"), QWeb = core.qweb, _t = core._t, Message = Widget.extend({
        template: "acrux_chat_message",
        events: {
            "click .o_attachment_view": "onAttachmentView",
            "click .o_attachment_download": "downloadAttachment"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.conversation || (this.conversation = parent), 
            this.options = _.extend({}, options), this.context = _.extend({}, this.parent.context || {}, this.options.context), 
            this.update(this.options);
        },
        update: function(options) {
            this.options = options, this.id = options.id, this.ttype = options.ttype || "text", 
            this.from_me = options.from_me || !1, this.text = options.text || "", this.res_model = options.res_model || !1, 
            this.res_id = options.res_id || !1, this.error_msg = options.error_msg || !1, this.show_product_text = options.show_product_text || !1, 
            this.res_model_obj = options.res_model_obj, this.date_message = options.date_message || moment(), 
            this.convertDate("date_message"), "location" == this.ttype && this.createLocationObj(), 
            this.title_color = options.title_color || "#000000", this.title_color = "#FFFFFF" != this.title_color ? this.title_color : "#000000", 
            this.metadata_type = options.metadata_type || null, this.metadata_json = options.metadata_json || null, 
            this.buttons = options.button_ids || [], this.create_uid = options.create_uid || [ null, "" ], 
            this.chat_list = options.chat_list_id || [ null, "" ];
        },
        willStart: function() {
            let def = !1;
            return this.res_model && !this.res_model_obj && (def = this._rpc({
                model: this.res_model,
                method: "read_from_chatroom",
                args: [ this.res_id ],
                context: this.context
            }).then((result => {
                if (result.length > 0) if (this.res_model_obj = result[0], "product.product" == this.res_model) {
                    let price = this.res_model_obj.lst_price;
                    price = this.conversation.parent.format_monetary(price), this.res_model_obj.lst_price = price, 
                    this.res_model_obj.show_product_text = this.show_product_text;
                } else {
                    let filename = this.res_model_obj.display_name || _t("Unnamed");
                    this.res_model_obj.filename = filename, this.res_model_obj.name = filename, this.res_model_obj.url = "/web/content/" + this.res_model_obj.id + "?download=true";
                } else "product.product" == this.res_model ? this.res_model_obj = {
                    display_name: _t("Product not found")
                } : (this.res_model_obj = {
                    display_name: _t("File not found")
                }, this.res_model_obj.filename = this.res_model_obj.display_name);
            }))), Promise.all([ this._super(), def ]);
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        _initRender: function() {
            let def = Promise.resolve();
            if (this.res_model_obj) if ("product.product" == this.res_model) this.$(".oe_product_details > ul > li").last().remove(); else if ("audio" == this.ttype) def = this.audioController(); else if (this.res_model_obj.mimetype) {
                if ([ "image", "video" ].includes(this.ttype)) {
                    const $img = this.$("div.o_image_box.o_attachment_view");
                    if ($img) {
                        const style = $img.children().eq(0).attr("style");
                        style && $img.children().eq(0).attr("style", style.replace("38x38", "100x100")), 
                        $img.children().eq(0).addClass("o_acrux_img_fix");
                    }
                }
            } else this.$("div#o_attach_zone").html(this._renderCustomObject());
            return "apichat_preview_post" === this.metadata_type && def.then((() => this.messageMetadataController())), 
            Promise.all([ def ]).then((() => this.makeMessageDragAndDrop()));
        },
        _renderCustomObject: function() {
            let out = "";
            return this.res_model_obj.display_name && (out = `<i>${this.res_model_obj.display_name}</i>`), 
            out;
        },
        message_css_class: function() {
            return this.message_css_class_list().join(" ");
        },
        message_css_class_list: function() {
            return [];
        },
        isToDrop: function() {
            return !1;
        },
        makeMessageDragAndDrop: function() {
            this.isToDrop() && this.$el.draggable({
                revert: !0,
                revertDuration: 0,
                containment: this.conversation.parent.$el,
                appendTo: this.conversation.parent.$el,
                helper: "clone"
            });
        },
        destroy: function() {
            return this._super.apply(this, arguments);
        },
        export_to_json: function() {
            let out = {};
            return out.text = this.text, out.from_me = this.from_me, out.ttype = this.ttype, 
            out.res_model = this.res_model, out.res_id = this.res_id, this.id && (out.id = this.id), 
            out.title_color = this.title_color, this.metadata_type && (out.metadata_type = this.metadata_type), 
            this.metadata_json && (out.metadata_json = this.metadata_json), this.buttons && (out.button_ids = this.buttons), 
            this.create_uid && (out.create_uid = this.create_uid), this.chat_list[0] && (out.chat_list_id = this.chat_list), 
            out;
        },
        export_to_vals: function() {
            let out = this.export_to_json();
            return delete out.title_color, out.button_ids && (out.button_ids = out.button_ids.map((btn => [ 0, 0, btn ]))), 
            out.create_uid && delete out.create_uid, out.chat_list_id && out.chat_list_id[0] && (out.chat_list_id = out.chat_list_id[0]), 
            out;
        },
        setErrorMessage: function(error_msg) {
            this.error_msg = error_msg;
        },
        getDateTmpl: function() {
            return QWeb.render("acrux_chat_chat_date", {
                widget: this
            });
        },
        getDate: function() {
            return field_utils.format.date(this.date_message, {
                type: "datetime"
            }, {
                timezone: !0
            });
        },
        getHour: function() {
            let value = this.date_message.clone();
            return value.add(session.getTZOffset(value), "minutes"), value.format("HH:mm");
        },
        onAttachmentView: function(event) {
            event.stopPropagation();
            var activeAttachmentID = $(event.currentTarget).data("id");
            if (activeAttachmentID) {
                let attachments = [];
                attachments.push(this.res_model_obj);
                var attachmentViewer = new DocumentViewer(this, attachments, activeAttachmentID);
                attachmentViewer.appendTo($("body")).then((() => {
                    attachmentViewer.$el.addClass("acrux_modal");
                }));
            }
        },
        downloadAttachment: function(event) {
            event.stopPropagation();
        },
        audioController: function() {
            this.audioPlayerWidget && this.audioPlayerWidget.destroy();
            let options = {
                context: this.context,
                src: `/web/chatresource/${this.res_model_obj.id}`
            };
            return this.audioPlayerWidget = new AudioPlayer(this, options), this.audioPlayerWidget.appendTo(this.$("#audio_player"));
        },
        createLocationObj: function() {
            if (this.text) try {
                let text = this.text.split("\n"), loc_obj = {};
                loc_obj.display_name = text[0].trim(), loc_obj.address = text[1].trim(), loc_obj.coordinate = text[2].trim(), 
                text = loc_obj.coordinate.replace("(", "").replace(")", ""), text = text.split(","), 
                loc_obj.coordinate = {
                    x: text[0].trim(),
                    y: text[1].trim()
                }, loc_obj.map_url = "https://maps.google.com/maps/search/", loc_obj.map_url += `${loc_obj.display_name}/@${loc_obj.coordinate.x},${loc_obj.coordinate.y},17z?hl=es`, 
                loc_obj.map_url = encodeURI(loc_obj.map_url), this.location = loc_obj;
            } catch (err) {
                console.log("error location"), console.log(err);
            }
        },
        convertDate: function(field) {
            this[field] && (this[field] instanceof String || "string" == typeof this[field]) && (this[field] = field_utils.parse.datetime(this[field]));
        },
        canBeAnswered: function() {
            return !0;
        },
        canBeDeleted: function() {
            return !0;
        },
        hasTitle: function() {
            return this.from_me && this.getShowUser();
        },
        messageMetadataController: function() {
            this.messageMetadataWidget && this.messageMetadataWidget.destroy();
            let options = {
                metadata_type: this.metadata_type,
                metadata_json: this.metadata_json
            };
            return this.messageMetadataWidget = new MessageMetadata(this, options), this.$(".o_message_metadata_preview").removeClass("o_hidden"), 
            this.messageMetadataWidget.appendTo(this.$(".o_message_metadata_preview"));
        },
        getShowUser: function() {
            return this.from_me && !!this.conversation?.parent?.show_user_in_message;
        }
    });
    return Message;
})), odoo.define("whatsapp_connector.message_metadata", (function(require) {
    "use strict";
    const Widget = require("web.Widget"), session = require("web.session"), AudioPlayer = require("whatsapp_connector.audio_player"), MessageMetadata = Widget.extend({
        template: "acrux_chat_message_metadata",
        events: {
            "click .o_acrux_chat_message_metadata": "openExternalLink"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.type = options.metadata_type, 
            this.data = JSON.parse(options.metadata_json), this.data.title = this.data.title || "", 
            this.data.body = this.data.body || "";
        },
        start: function() {
            return this._super().then((() => {
                const out = [];
                return "audio" === this.data?.media?.type && this.data?.media?.url && out.push(this.audioController()), 
                Promise.all(out);
            }));
        },
        audioController: function() {
            this.audioPlayerWidget && this.audioPlayerWidget.destroy();
            let options = {
                context: this.context,
                src: this.data.media.url
            };
            return this.audioPlayerWidget = new AudioPlayer(this, options), this.$(".acrux_metadata_media").addClass("status_audio"), 
            this.audioPlayerWidget.appendTo(this.$(".acrux_metadata_media"));
        },
        openExternalLink: function() {
            this.data.url && window.open(session.url(this.data.url), "_blank");
        }
    });
    return MessageMetadata;
})), odoo.define("whatsapp_connector.process_notifaction", (function(require) {
    "use strict";
    var Class = require("web.Class"), webClient = require("web.web_client"), core = require("web.core"), session = require("web.session"), _t = core._t;
    return Class.extend({
        process: function(data) {
            let msg = null;
            data.forEach((row => {
                row.new_messages ? msg = this.processNewMessage(row) : row.opt_in ? this.processOptIn(row) : row.error_messages && this.processErrorMessage(row);
            })), msg && (msg.messages && msg.messages.length && "text" == msg.messages[0].ttype ? webClient.call("bus_service", "sendNotification", _t("New Message from ") + msg.name, msg.messages[0].text) : webClient.call("bus_service", "sendNotification", _t("New Message from ") + msg.name, ""));
        },
        processNewMessage: function(row) {
            row.new_messages.forEach((conv => {
                conv.messages ? conv.messages = conv.messages.filter((msg => !msg.from_me)) : conv.messages = [];
            }));
            let msg = row.new_messages.find((conv => "all" == conv.desk_notify && conv.messages.length));
            return msg || (msg = row.new_messages.find((conv => "mines" == conv.desk_notify && conv.agent_id && conv.agent_id[0] == session.uid && conv.messages.length))), 
            msg;
        },
        processOptIn: function(row) {
            const notify = {
                type: row.opt_in.opt_in ? "success" : "warning",
                title: _t("Opt-in update"),
                message: row.opt_in.name + " " + (row.opt_in.opt_in ? _t("activate") : _t("deactivate")) + " opt-in.",
                sticky: !0
            };
            webClient.displayNotification(notify);
            const children = webClient.action_manager.getChildren();
            if (children && children.forEach((child => {
                "acrux.chat.conversation" === child.modelName && child.reload().catch((() => {}));
            })), webClient.action_manager?.currentDialogController) {
                const widget = webClient.action_manager.currentDialogController.widget;
                widget && "acrux.chat.message.wizard" === widget.modelName && widget.$el && widget.$el.is(":visible") && widget.model.get(widget.handle, {
                    env: !1
                })?.data?.conversation_id?.data?.id === row.opt_in.conv && widget.reload().catch((() => {}));
            }
        },
        processErrorMessage: function(row) {
            const msgList = [];
            for (const conv of row.error_messages) for (const msg of conv.messages) if (msg.user_id[0] === session.uid) {
                const newMsg = Object.assign({}, msg);
                newMsg.name = conv.name, newMsg.number = conv.number_format, msgList.push(newMsg);
            }
            for (const msg of msgList) {
                let complement = "";
                msg.text && "" !== msg.text && (complement += _t("<br> Message: ") + msg.text);
                const notify = {
                    type: "danger",
                    title: _t("Message with error in <br>") + `${msg.name} (${msg.number})`,
                    message: _t("Error: ") + msg.error_msg + complement,
                    sticky: !0
                };
                webClient.displayNotification(notify);
            }
        }
    });
})), odoo.define("whatsapp_connector.chat_notify", (function(require) {
    "use strict";
    require("bus.BusService");
    var webClient = require("web.web_client"), session = require("web.session"), ProcessNotification = require("whatsapp_connector.process_notifaction"), notifactions_hash = new Map;
    function onNotifaction(notifications) {
        var data = notifications.filter((item => "acrux.chat.conversation" === item[0][1])).map((item => item[1]));
        if (data && data.length) {
            let json = JSON.stringify(data);
            !function() {
                let out = !1, children = webClient.action_manager.getChildren();
                return children && children.forEach((child => {
                    out = out || child.defaultChannelID && "acrux_chat_live_id" == child.defaultChannelID;
                })), out;
            }() ? notifactions_hash.set(json, setTimeout((() => {
                (new ProcessNotification).process(data), notifactions_hash.delete(json);
            }), 50)) : webClient.call("local_storage", "setItem", "chatroom_notification", json);
        }
    }
    function onStorage(event) {
        if ("chatroom_notification" === event.key) {
            const value = JSON.parse(event.newValue);
            notifactions_hash.has(value) && (clearTimeout(notifactions_hash.get(value)), notifactions_hash.delete(value));
        }
    }
    session.is_bound.then((() => {
        webClient.call("bus_service", "onNotification", this, onNotifaction), webClient.call("local_storage", "onStorage", this, onStorage);
    }));
})), odoo.define("whatsapp_connector.product_search", (function(require) {
    "use strict";
    var core = require("web.core"), Widget = require("web.Widget"), field_utils = require("web.field_utils"), _t = core._t, QWeb = core.qweb, ProductSearch = Widget.extend({
        template: "acrux_chat_product_search",
        events: {
            "click .o_button_product_search": "searchProduct",
            "keypress .product_search": "onKeypress",
            "click .acrux-product-send-btn": "productOptions"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.product_list = this.options.product_list || [], 
            this.is_minimize = !1;
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        _initRender: function() {
            return this.$el.resizable({
                handles: "s",
                stop: (e, ui) => {
                    this.calculateFomrSize(ui.element.height());
                }
            }), this.$input_search_product = this.$("input.product_search"), this.$input_search_product.focus((() => this.maximize())), 
            this.$product_items = this.$(".o_acrux_chat_product_items"), this.makeProductDragAndDrop(), 
            Promise.resolve();
        },
        makeProductDragAndDrop: function() {
            this.parent.$chat_message.droppable({
                drop: (_event, ui) => {
                    if (this.parent.selected_conversation && this.parent.selected_conversation.isMine()) {
                        let product = this.find(ui.draggable.data("id"));
                        product && this.sendProduct(product);
                    }
                },
                accept: ".o_product_record",
                activeClass: "drop-active",
                hoverClass: "drop-hover"
            });
        },
        sendProduct: function(product) {
            let options = {
                from_me: !0,
                ttype: "product",
                res_model: "product.product",
                res_id: product.id,
                res_model_obj: product
            };
            return this.parent.selected_conversation.createMessage(options);
        },
        searchProduct: function() {
            let val = this.$input_search_product.val() || "";
            return this._rpc({
                model: this.parent.model,
                method: "search_product",
                args: [ val.trim() ],
                context: this.context
            }).then((result => {
                result.forEach((x => {
                    x.lst_price = this.parent.format_monetary(x.lst_price), x.write_date = field_utils.parse.datetime(x.write_date), 
                    x.unique_hash_image = field_utils.format.datetime(x.write_date).replace(/[^0-9]/g, ""), 
                    x.show_product_text = !0;
                }));
                let html = QWeb.render("acrux_chat_product_list", {
                    product_list: result
                });
                this.product_list = result, this.$product_items.html(html), this.$product_items.children().draggable({
                    revert: !0,
                    revertDuration: 0,
                    containment: this.parent.$el,
                    appendTo: this.parent.$el,
                    helper: "clone"
                });
            }));
        },
        onKeypress: function(event) {
            13 === event.which && $(event.currentTarget).hasClass("product_search") && (event.preventDefault(), 
            this.searchProduct());
        },
        minimize: function() {
            if (!this.is_minimize) {
                const height = this.$(".o_acrux_chat_sidebar_title").height();
                this.$el.animate({
                    height
                }, 500), this.calculateFomrSize(height);
            }
        },
        calculateFomrSize: function(offset) {
            let headSize = $(".o_acrux_chat .o_acrux_group > .o_notebook > .o_notebook_headers").height();
            $(".o_acrux_chat .o_acrux_group > .o_notebook > .tab-content").css({
                height: `calc(100% - ${headSize}px)`
            }), $(".o_acrux_chat .o_acrux_group > .o_notebook > .tab-content").parent().parent().css({
                height: `calc(100% - ${offset}px)`
            }), this.is_minimize = !0;
        },
        maximize: function() {
            this.is_minimize && (this.$el.animate({
                height: "30%"
            }, 500), $(".o_acrux_chat .o_acrux_group > .o_notebook > .tab-content").parent().parent().css({
                height: "70%"
            }), $(".o_acrux_chat .o_acrux_group > .o_notebook > .tab-content").css({
                height: "calc(100% - 3em)"
            }), this.is_minimize = !1);
        },
        find: function(product_id) {
            return this.product_list.find((x => x.id == product_id));
        },
        productOptions: function(event) {
            let out, product_id = $(event.target).parent().parent().data("id");
            if (this.parent.selected_conversation) if (this.parent.selected_conversation.isMine()) {
                let product = this.find(product_id);
                out = product ? this.doProductOption(product, event) : Promise.resolve();
            } else this.call("crash_manager", "show_warning", {
                message: _t("Yoy are not writing in this conversation.")
            }), out = Promise.reject(); else this.call("crash_manager", "show_warning", {
                message: _t("You must select a conversation.")
            }), out = Promise.reject();
            return out;
        },
        doProductOption: function(product, _event) {
            return this.sendProduct(product).then((() => this.parent.hideRightPanel()));
        }
    });
    return ProductSearch;
})), odoo.define("whatsapp_connector.res_partner", (function(require) {
    "use strict";
    var session = require("web.session"), ResPartnerForm = require("whatsapp_connector.form_view").extend({
        init: function(parent, options) {
            options && (options.model = "res.partner", options.record = options.res_partner), 
            this._super.apply(this, arguments), this.parent = parent, _.defaults(this.context, {
                default_mobile: this.parent.selected_conversation.number_format,
                default_phone: this.parent.selected_conversation.number_format,
                default_name: this.parent.selected_conversation.name,
                default_user_id: session.uid
            }), this._context_hook();
        },
        start: function() {
            return this._super().then((() => {
                this.parent.product_search.minimize();
            }));
        },
        recordChange: function(res_partner) {
            return Promise.all([ this._super(res_partner), this._rpc({
                model: this.parent.model,
                method: "write",
                args: [ [ this.parent.selected_conversation.id ], {
                    res_partner_id: res_partner.data.id
                } ],
                context: this.context
            }).then((() => this._rpc({
                model: this.parent.model,
                method: "read",
                args: [ [ this.parent.selected_conversation.id ], [ "image_url" ] ],
                context: this.context
            }).then((img_url => {
                let result = [ res_partner.data.id, res_partner.data.name ];
                this.record = result, this.parent.selected_conversation.res_partner_id = result, 
                this.parent.selected_conversation.image_url = img_url[0].image_url, this.parent.selected_conversation.replace();
            })))) ]);
        },
        recordSaved: function(record) {
            return this._super(record).then((() => this._rpc({
                model: this.parent.model,
                method: "update_conversation_bus",
                args: [ [ this.parent.selected_conversation.id ] ],
                context: this.context
            })));
        }
    });
    return ResPartnerForm;
})), odoo.define("whatsapp_connector.toolbox", (function(require) {
    "use strict";
    var data = require("web.data"), DocumentViewer = require("mail.DocumentViewer"), Widget = require("web.Widget"), core = require("web.core"), Emojis = require("whatsapp_connector.emojis"), session = require("web.session"), StandaloneFieldManagerMixin = require("web.StandaloneFieldManagerMixin"), BooleanToggle = require("web.basic_fields").BooleanToggle, QWeb = core.qweb, _t = core._t, ToolBox = Widget.extend(StandaloneFieldManagerMixin, {
        template: "acrux_chat_toolbox",
        events: {
            "click .o_chat_toolbox_send": "sendMessage",
            "keypress .o_chat_toolbox_text_field": "onKeypress",
            "keydown .o_chat_toolbox_text_field": "onKeydown",
            "paste .o_chat_toolbox_text_field": "onPaste",
            "input .o_chat_toolbox_text_field": "onInput",
            "click .o_chat_button_add_attachment": "clickAddAttachment",
            "click .o_attachment_delete": "deleteAttachment",
            "click .o_chat_button_emoji": "toggleEmojis",
            "click span.o_acrux_emoji": "addEmoji",
            "change input.o_input_file": "changeAttachment",
            "click .o_attachment_view": "viewAttachment",
            "click .o_attachment_download": "downloadAttachment"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), StandaloneFieldManagerMixin.init.call(this), 
            this.signing_active = this.options.signing_active || !1, this._attachmentDataSet = new data.DataSetSearch(this, "ir.attachment", this.context), 
            this.fileuploadID = _.uniqueId("o_chat_fileupload"), this.set("attachment_ids", options.attachmentIds || []);
        },
        willStart: function() {
            return this._super().then((() => this.getUserPreference())).then((() => this.processUserPreference()));
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        _initRender: function() {
            let classes = [ "o_chat_toolbox_done", "o_chat_toolbox_container", "o_chat_toolbox_send", "o_chat_button_add_attachment", "o_chat_button_emoji", "o_chat_toolbox_user_preference" ];
            classes = "." + classes.join(", ."), this.$input = this.$(".o_chat_toolbox_text_field"), 
            this.$attachment_button = this.$(".o_chat_button_add_attachment"), this.$attachment_zone = this.$(".o_toolbox_file_uploader"), 
            this.$other_inputs = this.$(classes), this.$write_btn = this.$(".o_chat_toolbox_write"), 
            this.$write_btn.click((() => this.blockClient())), this.$send_btn = this.$(".o_chat_toolbox_send"), 
            this.$(".o_chat_toolbox_done").click((() => this.releaseClient())), this.$input.on("input", (function() {
                this.style.height = "15px", this.style.height = this.scrollHeight + "px";
            })), this.$emoji_btn = this.$(".o_chat_button_emoji");
            let emoji_html = QWeb.render("acrux_chat_emojis"), emoji_list = Emojis.data.map((emoji => `<span data-source="${emoji}" class="o_acrux_emoji">${emoji}</span>`));
            return this.$el.popover({
                trigger: "manual",
                animation: !0,
                html: !0,
                title: function() {
                    return "nada";
                },
                container: this.$el,
                placement: "top",
                content: `<div class="o_acrux_emoji_container">${emoji_list.join("\n")}</div>`,
                template: emoji_html
            }).on("inserted.bs.popover", (() => {
                setTimeout((() => this.fix_popover_position()), 20);
            })), $(window).resize((() => {
                this.fix_popover_position();
            })), this.$user_preference = this.$(".o_chat_toolbox_user_preference"), this.$message_signing = this.$(".o_chat_toolbox_message_signing"), 
            this.$toolbox_container = this.$(".o_chat_toolbox_container"), this.$write_done_btn = this.$(".o_chat_write_done_btn"), 
            this.renderAttachments(), $(window).on(this.fileuploadID, this.loadedAttachment.bind(this)), 
            this.on("change:attachment_ids", this, this.renderAttachments), Promise.resolve().then((() => this.signingWidget.appendTo(this.$message_signing)));
        },
        destroy: function() {
            return $(window).off(this.fileuploadID), this.off("change:attachment_ids"), this._super.apply(this, arguments);
        },
        blockClient: function() {
            let out;
            return out = this.parent.selected_conversation ? this._rpc({
                model: this.parent.model,
                method: "block_conversation",
                args: [ [ this.parent.selected_conversation.id ] ],
                context: this.context
            }).then((conv => (this.$write_btn.addClass("o_hidden"), this.$other_inputs.removeClass("o_hidden"), 
            this.check_component_visibility(), this.parent.upsertConversation(conv), this.parent.showConversations().then((() => this.parent.selected_conversation.showMessages())).then((() => {
                this.parent.selected_conversation.$el.addClass("active"), this.parent.tabsClear();
            }))))).catch((() => {
                "new" == this.parent.selected_conversation.status && this.parent.removeSelectedConversation();
            })) : Promise.reject(), out;
        },
        releaseClient: function() {
            let out;
            return out = this.parent.selected_conversation && this.parent.selected_conversation.isMine() ? this._rpc({
                model: this.parent.model,
                method: "release_conversation",
                args: [ [ this.parent.selected_conversation.id ] ],
                context: this.context
            }).then((() => {
                this.parent.removeSelectedConversation(), this.parent.showConversationPanel();
            })) : Promise.reject(), out;
        },
        do_show: function() {
            this._super(), this.parent.selected_conversation ? this.parent.selected_conversation.isMine() ? (this.$write_btn.addClass("o_hidden"), 
            this.$other_inputs.removeClass("o_hidden"), this.check_component_visibility()) : ("current" !== this.parent.selected_conversation.status ? this.$write_btn.removeClass("o_hidden") : this.$write_btn.addClass("o_hidden"), 
            this.$other_inputs.addClass("o_hidden")) : (this.$write_btn.addClass("o_hidden"), 
            this.$other_inputs.addClass("o_hidden")), this.$el.popover("hide");
        },
        check_component_visibility: function() {
            this.parent.selected_conversation.allow_signing ? this.$message_signing.removeClass("o_hidden") : this.$message_signing.addClass("o_hidden");
        },
        sendMessage: async function(event) {
            this.$input.prop("disabled", !0), this.$send_btn.prop("disabled", !0);
            let out = Promise.resolve(), options = {
                from_me: !0
            }, text = this.$input.val().trim(), attachments = this.get("attachment_ids");
            if (event && (event.preventDefault(), event.stopPropagation()), "" != text && (options.ttype = "text", 
            options.text = text), attachments.length) {
                let attachment = attachments[0];
                attachment.mimetype.includes("image") ? options.ttype = "image" : attachment.mimetype.includes("audio") ? options.ttype = "audio" : attachment.mimetype.includes("video") ? options.ttype = "video" : options.ttype = "file", 
                options.res_model = "ir.attachment", options.res_id = attachment.id, options.res_model_obj = attachment;
            }
            return options.ttype && (options = this.sendMessageHook(options), out = this.parent.selected_conversation.createMessage(options).then((msg => (this.$input.prop("disabled", !1), 
            text = "", this.$input.height("15px"), this.$input.focus(), this.set("attachment_ids", []), 
            this.enableDisplabeAttachBtn(), this.parent.upsertConversation(), this.parent.showConversations().then((() => msg)))))), 
            out.finally((() => {
                this.$input.prop("disabled", !1), this.$send_btn.prop("disabled", !1), this.setInputText(text);
            }));
        },
        sendMessageHook: function(options) {
            return options;
        },
        onKeypress: function(event) {
            13 !== event.which || event.shiftKey || (event.preventDefault(), event.stopPropagation(), 
            this.sendMessage());
        },
        onKeydown: function(_event) {},
        onInput: function(event) {
            const {target: textarea} = event;
            textarea.style.height = "auto";
            const newHeight = textarea.scrollHeight - (textarea.offsetHeight - textarea.clientHeight);
            textarea.style.height = Math.min(newHeight, 250) + "px", textarea.style.overflow = newHeight > 250 ? "auto" : "hidden";
        },
        onPaste: function(event) {
            let clipboardData = event.originalEvent.clipboardData || window.clipboardData;
            if (clipboardData) {
                var items = clipboardData.items;
                for (let index in items) {
                    const item = items[index];
                    if ("file" === item.kind) {
                        event.stopPropagation(), event.preventDefault(), this.component.attachment.value || this.component.uploadFile({
                            target: {
                                files: [ item.getAsFile() ]
                            }
                        });
                        break;
                    }
                }
            }
        },
        toggleEmojis: function() {
            this.$el.popover("toggle"), setTimeout((() => this.$(".o_acrux_emoji_popover:visible").on("mouseleave", (() => {
                this.$el.popover("hide");
            }))), 50);
        },
        addEmoji: function(event) {
            const inputRef = this.$input[0], startPos = inputRef.selectionStart, endPos = inputRef.selectionEnd, firstText = inputRef.value.substring(0, startPos), lastText = inputRef.value.substring(endPos, inputRef.value.length), text = $(event.target).data("source");
            this.setInputText(`${firstText}${text}${lastText}`), inputRef.selectionStart = startPos + text.length, 
            inputRef.selectionEnd = startPos + text.length;
        },
        fix_popover_position: function() {
            let popover = this.$(".o_acrux_emoji_popover");
            if (popover.length) {
                let popover_data = popover[0].getBoundingClientRect(), el_data = this.$el[0].getBoundingClientRect(), msg_data = this.parent.$chat_message[0].getBoundingClientRect();
                popover_data.height > msg_data.height ? (popover.css("max-height", msg_data.height), 
                popover.css("height", msg_data.height), popover.offset({
                    top: el_data.top - msg_data.height
                })) : popover_data.height < msg_data.height && (popover.css("max-height", ""), popover.css("height", ""), 
                popover.offset({
                    top: el_data.top - popover.height()
                })), popover.css("z-index", 100);
            }
        },
        getUserPreference: function() {
            return this._rpc({
                model: "res.users",
                method: "read",
                args: [ [ session.uid ], [ "chatroom_signing_active" ] ],
                context: this.context
            }).then((result => {
                this.signing_active = result[0].chatroom_signing_active;
            }));
        },
        changeStatusNotify: function(data) {
            this.signing_active = !!data.signing_active, this.signingNoUpdate = !0, this.signingWidget._setValue(this.signing_active).then((() => this.signingNoUpdate = !1));
        },
        processUserPreference: function() {
            return this.model.makeRecord("res.users", [ {
                name: "signing_active",
                type: "boolean",
                value: this.signing_active
            } ]).then((recordID => {
                const record = this.model.get(recordID);
                this.signingWidget = new BooleanToggle(this, "signing_active", record, {
                    attrs: {
                        modifiers: {},
                        string: _t("Sign Message")
                    }
                }), this._registerWidget(recordID, "signing_active", this.signingWidget);
            }));
        },
        _confirmChange: function() {
            var result = StandaloneFieldManagerMixin._confirmChange.apply(this, arguments);
            return result.then((() => {
                let out = Promise.resolve();
                return this.signingNoUpdate || (out = this._rpc({
                    model: "res.users",
                    method: "write",
                    args: [ [ session.uid ], {
                        chatroom_signing_active: this.signingWidget.value
                    } ],
                    context: this.context
                })), out;
            }));
        },
        renderAttachments: function() {
            this.$attachment_zone.html(QWeb.render("mail.composer.Attachments", {
                attachments: this.get("attachment_ids")
            }));
            const $img = this.$("div.o_image_box.o_attachment_view");
            if ($img) {
                const style = $img.children().eq(0).attr("style");
                style && $img.children().eq(0).attr("style", style.replace("38x38", "100x100"));
            }
            this.parent.selected_conversation && this.parent.selected_conversation.needScroll() && this.parent.selected_conversation.scrollConversation();
        },
        changeAttachment: function(ev) {
            this._processAttachmentChange({
                files: ev.currentTarget.files,
                submitForm: !0
            }), ev.target.value = "";
        },
        _processAttachmentChange: function(params) {
            var self = this, attachments = this.get("attachment_ids"), files = params.files, submitForm = params.submitForm, $form = this.$("form.o_form_binary_form");
            _.each(files, (function(file) {
                var attachment = _.findWhere(attachments, {
                    name: file.name,
                    size: file.size
                });
                attachment && (self._attachmentDataSet.unlink([ attachment.id ]), attachments = _.without(attachments, attachment));
            })), submitForm ? $form.submit() : _.each(files, (function(file) {
                var newFormData, formData = (newFormData = new window.FormData, $form.find("input").each((function(index, input) {
                    "ufile" !== input.name && newFormData.append(input.name, input.value);
                })), newFormData);
                formData.append("ufile", file, file.name), $.ajax({
                    url: $form.attr("action"),
                    type: "POST",
                    enctype: "multipart/form-data",
                    processData: !1,
                    contentType: !1,
                    data: formData,
                    success: function(result) {
                        var $el = $(result);
                        $.globalEval($el.contents().text());
                    }
                });
            }));
            var uploadAttachments = _.map(files, (function(file) {
                return {
                    id: 0,
                    name: file.name,
                    filename: file.name,
                    url: "",
                    upload: !0,
                    mimetype: ""
                };
            }));
            attachments = attachments.concat(uploadAttachments), this.set("attachment_ids", attachments);
        },
        deleteAttachment: function(event) {
            event.stopPropagation();
            var $el, attachment_id, self = this;
            if (($el = $(event.target)).is("span") && ($el = $el.parent()), attachment_id = $el.data("id")) {
                var attachments = [];
                _.each(this.get("attachment_ids"), (function(attachment) {
                    attachment_id !== attachment.id ? attachments.push(attachment) : self._attachmentDataSet.unlink([ attachment_id ]);
                })), this.set("attachment_ids", attachments), this.enableDisplabeAttachBtn(), this.$("input.o_input_file").val("");
            }
        },
        downloadAttachment: function(ev) {
            ev.stopPropagation();
        },
        loadedAttachment: function() {
            let self = this, attachments = this.get("attachment_ids"), files = Array.prototype.slice.call(arguments, 1);
            _.each(files, function(file) {
                if (file.error || !file.id) self.do_warn(file.error), attachments = _.filter(attachments, (function(attachment) {
                    return !attachment.upload;
                })); else {
                    var attachment = _.findWhere(attachments, {
                        filename: file.filename,
                        upload: !0
                    });
                    attachment && (attachments = _.without(attachments, attachment), attachments.push({
                        id: file.id,
                        name: file.name || file.filename,
                        filename: file.filename,
                        mimetype: file.mimetype,
                        url: session.url("/web/content", {
                            id: file.id,
                            download: !0
                        })
                    }));
                }
            }.bind(this)), this.set("attachment_ids", attachments), this.enableDisplabeAttachBtn();
        },
        viewAttachment: function(ev) {
            var activeAttachmentID = $(ev.currentTarget).data("id"), attachments = this.get("attachment_ids");
            if (activeAttachmentID) {
                var attachmentViewer = new DocumentViewer(this, attachments, activeAttachmentID);
                attachmentViewer.appendTo($("body")), attachmentViewer.appendTo($("body")).then((() => {
                    attachmentViewer.$el.addClass("acrux_modal");
                }));
            }
        },
        clickAddAttachment: function() {
            this.$("input.o_input_file").click(), this.$input.focus();
        },
        needDisableInput: function(attachment) {
            return !(attachment.mimetype.includes("image") || attachment.mimetype.includes("video"));
        },
        enableDisplabeAttachBtn: function() {
            let attachments = this.get("attachment_ids");
            if (this.$attachment_button.prop("disabled", Boolean(attachments.length)), attachments.length) {
                let attachment = attachments[0];
                this.needDisableInput(attachment) && (this.setInputText(""), this.$input.prop("disabled", !0), 
                this.$emoji_btn.prop("disabled", !0));
            } else this.$emoji_btn.prop("disabled", !1), this.$input.prop("disabled", !1), this.$input.focus();
        },
        setInputText: function(text) {
            this.$input.prop("disabled") || this.$input.prop("readonly") || (this.$input.val(text), 
            this.onInput({
                target: this.$input[0]
            }));
        }
    });
    return ToolBox;
})), odoo.define("whatsapp_connector.acrux_chat_translate", (function(require) {
    "use strict";
    var _t = require("web.core")._t;
    _t("Active in Chat"), _t("Deactivate"), _t("Inactive in Chat"), _t("Activate");
})), odoo.define("whatsapp_connector.tree_view", (function(require) {
    "use strict";
    var FormView = require("whatsapp_connector.form_view"), dom = require("web.dom"), TreeView = FormView.extend({
        init: function(parent, options) {
            this._super.apply(this, arguments);
        },
        start: function() {
            return this._super().then((action => (this.action.controllers.list && this.action.controllers.list.then((r => {
                this.acrux_form_widget = r.widget, this.acrux_form_widget.acrux_widget = this, this._showAcruxFormView();
            })), action)));
        },
        getDoActionDict: function() {
            return {
                type: "ir.actions.act_window",
                view_type: "form",
                view_mode: "list",
                res_model: this.model,
                views: [ [ this.form_name, "list" ], [ !1, "search" ] ],
                target: "inline",
                context: this.context,
                flags: this.getDoActionFlags()
            };
        },
        getDoActionFlags: function() {
            return {
                withControlPanel: !0,
                footerToButtons: !1,
                hasSearchView: !0,
                hasSidebar: !1,
                searchMenuTypes: [ "filter", "groupBy" ],
                withSearchPanel: !0,
                withSearchBar: !0
            };
        },
        getOptions: function() {
            return {
                replace_last_action: !1,
                pushState: !1,
                clear_breadcrumbs: !1
            };
        },
        _showAcruxFormView: function() {
            return dom.append(this.$el, this.acrux_form_widget.$el, {
                in_DOM: !0,
                callbacks: [ {
                    widget: this
                }, {
                    widget: this.acrux_form_widget
                } ]
            }), Promise.resolve();
        },
        on_attach_callback: function() {
            this.$(".breadcrumb").hide();
        }
    });
    return TreeView;
})), odoo.define("whatsapp_connector.user_status", (function(require) {
    "use strict";
    var core = require("web.core"), Widget = require("web.Widget"), session = require("web.session"), _t = core._t, UserStatus = Widget.extend({
        template: "acrux_chat_user_status",
        events: {
            "click label#chat_status_active": "changeStatus",
            "click label#chat_status_inactive": "changeStatus",
            "click .acrux_simple_create_new_conv": "openSimpleNewConversation",
            "click .acrux_order_current_conversation": "reorderConversations"
        },
        init: function(parent, options) {
            this._super.apply(this, arguments), this.parent = parent, this.options = _.extend({}, options), 
            this.context = _.extend({}, this.parent.context || {}, this.options.context), this.acrux_chat_active = this.options.acrux_chat_active, 
            this.conversationOrder = this.parent.conversationOrder;
        },
        willStart: function() {
            return Promise.all([ this._super(), this.getUserStatus() ]);
        },
        start: function() {
            return this._super().then((() => this._initRender()));
        },
        _initRender: function() {
            return this.$lables_status = this.$("label#chat_status_active, label#chat_status_inactive"), 
            this.acrux_chat_active ? this.$("label#chat_status_active").addClass("active") : this.$("label#chat_status_inactive").addClass("active"), 
            Promise.resolve();
        },
        getUserStatus: function() {
            return this._rpc({
                model: "res.users",
                method: "read",
                args: [ [ session.uid ], [ "acrux_chat_active" ] ],
                context: this.context
            }).then((result => {
                this.acrux_chat_active = result[0].acrux_chat_active;
            }));
        },
        changeStatus: function(event) {
            let toggle = !1;
            "chat_status_active" == $(event.target).prop("id") ? this.acrux_chat_active || (toggle = !0) : this.acrux_chat_active && (toggle = !0), 
            toggle && (this.$lables_status.toggleClass("active"), this.acrux_chat_active = !this.acrux_chat_active, 
            this._rpc({
                model: "res.users",
                method: "set_chat_active",
                args: [ [ session.uid ], {
                    acrux_chat_active: this.acrux_chat_active
                } ],
                context: this.context
            }));
        },
        changeStatusNotify: function(data) {
            this.acrux_chat_active != data.status && this.$lables_status.toggleClass("active"), 
            this.acrux_chat_active = data.status;
        },
        isActive: function() {
            return this.acrux_chat_active;
        },
        openSimpleNewConversation: function() {
            let action = {
                type: "ir.actions.act_window",
                name: _t("Search"),
                view_type: "form",
                view_mode: "form",
                res_model: "acrux.chat.simple.new.conversation.wizard",
                views: [ [ !1, "form" ] ],
                target: "new",
                context: this.context
            };
            this.do_action(action);
        },
        reorderConversations: function(event) {
            return this.parent.reorderConversations(event);
        }
    });
    return UserStatus;
})), odoo.define("whatsapp_connector.BasicController", (function(require) {
    "use strict";
    var BasicController = require("web.BasicController");
    return BasicController.include({
        _discardChanges: function(recordID, options) {
            return this._super(recordID, options).then((_x => {
                if (this.acrux_widget) {
                    let env = this.model.get(this.handle, {
                        env: !0
                    });
                    recordID || env.currentId || this.acrux_widget.discardChange();
                }
                return _x;
            }));
        },
        update: function(params, options) {
            return this._super(params, options).then((_x => {
                if (this.acrux_widget) {
                    let record = this.model.get(this.handle, {
                        env: !1
                    });
                    return this.acrux_widget.recordUpdated(record).then((() => _x));
                }
                return _x;
            }));
        },
        _pushState: function(state) {
            this.model.get(this.handle).getContext().is_acrux_chat_room || this._super(state);
        },
        saveRecord: function(recordID, options) {
            return this._super(recordID, options).then((_x => {
                if (this.acrux_init_conv) {
                    let env = this.model.get(this.handle, {
                        env: !0
                    });
                    this.acrux_init_conv(env.currentId);
                }
                if (this.acrux_widget) {
                    let record = this.model.get(this.handle, {
                        env: !1
                    });
                    return this.acrux_widget.recordSaved(record).then((() => _x));
                }
                return _x;
            }));
        },
        _onFieldChanged: function(event) {
            if (event?.data?.dataPointID) {
                const model = event.data.dataPointID.split("_")[0];
                if (this.modelName !== model) {
                    const backFunc = event.data.onSuccess || function() {};
                    event.data.onSuccess = () => {
                        let prom;
                        if (this.acrux_widget) {
                            let record = this.model.get(this.handle, {
                                env: !1
                            });
                            prom = this.acrux_widget.recordSaved(record);
                        } else prom = Promise.resolve();
                        prom.then(backFunc);
                    };
                }
            }
            return this._super(event);
        }
    }), BasicController;
})), odoo.define("whatsapp_connector.KanbanController", (function(require) {
    "use strict";
    var KanbanController = require("web.KanbanController");
    return KanbanController.include({
        _onAddRecordToColumn: function(ev) {
            return this.fromOnAddRecordToColumnData = ev.data, this._super(ev);
        },
        _resequenceRecords: function(column_id, ids) {
            const fromOnAddRecordToColumnData = this.fromOnAddRecordToColumnData;
            return this.fromOnAddRecordToColumnData = null, this._super(column_id, ids).then((out => (this.acrux_widget && fromOnAddRecordToColumnData && this.acrux_widget._resequenceRecords(fromOnAddRecordToColumnData).catch((() => {})), 
            out)));
        }
    }), KanbanController;
})), odoo.define("whatsapp_connector.ListController", (function(require) {
    "use strict";
    var core = require("web.core"), ListController = require("web.ListController"), _t = core._t;
    return ListController.include({
        renderButtons: function($node) {
            let out = this._super($node);
            return this.renderer.state.context.chatroom_wizard_search && $node && $node.length && "FOOTER" === $node[0].nodeName && ($node.html(`<button type="button" class="btn btn-primary btn-chatroom-wizard-select">${_t("Select")}</button>`), 
            $node.find(".btn-chatroom-wizard-select").attr("disabled", "disabled"), $node.find(".btn-chatroom-wizard-select").click(this._chatroomSelectRow.bind(this)), 
            this.$acrux_footer = $node), out;
        },
        _onSelectionChanged: function(event) {
            this._super(event), this.renderer.state.context.chatroom_wizard_search && (this.selectedRecords && 1 == this.selectedRecords.length ? this.$acrux_footer.find(".btn-chatroom-wizard-select").removeAttr("disabled") : this.$acrux_footer.find(".btn-chatroom-wizard-select").attr("disabled", "disabled"));
        },
        _chatroomSelectRow: function(event) {
            if (event.preventDefault(), this.selectedRecords && 1 == this.selectedRecords.length) {
                const record = this.model.get(this.selectedRecords[0], {
                    env: !1
                });
                record && this._chatroomSelectRecord(record);
            }
            this.getParent().currentDialogController.dialog.close();
        }
    }), ListController;
})), odoo.define("whatsapp_connector.ActionManager", (function(require) {
    "use strict";
    var ActionManager = require("web.ActionManager");
    return ActionManager.include({
        _executeAction: function(action, options) {
            if (action.context.is_acrux_chat_room && "inline" == action.target) {
                var controller = this.controllers[action.controllerID];
                this.actions[action.jsID] = action, action.action_ready = this._startController(controller).guardedCatch((() => {
                    this._removeAction(action.jsID);
                }));
            } else action.action_ready = this._super(action, options);
            return action.action_ready;
        }
    }), ActionManager;
})), odoo.define("whatsapp_connector.basic_fields", (function(require) {
    "use strict";
    var InputField = require("web.basic_fields").InputField, registry = require("web.field_registry"), ColorPicker = InputField.extend({
        className: "o_color_picker_field",
        supportedFieldTypes: [ "char" ],
        description: "",
        init: function() {
            this._super.apply(this, arguments), this.tagName = "input";
        },
        _renderReadonly: function() {
            this.$el.val(this.value), this.$el.attr({
                disabled: !0,
                type: "color"
            }), this.$el.css("maxWidth", "4em");
        },
        _renderEdit: function() {
            this._super(), this.$input.css("maxWidth", "4em"), this.$el.attr({
                type: "color"
            });
        },
        _getValue: function() {
            return this._super().toUpperCase();
        }
    });
    return registry.add("color_picker", ColorPicker), {
        ColorPicker
    };
})), odoo.define("whatsapp_connector.relational_fields", (function(require) {
    "use strict";
    require("web.relational_fields").FieldMany2ManyTags.include({
        _renderTags: function() {
            this._super(), this?.nodeOptions?.acrux_color && this.$el.find("div").each((function() {
                $(this).css("background-color", $(this).data().color), $(this).find("span").addClass("o_badge_text_contrast");
            }));
        }
    });
}));