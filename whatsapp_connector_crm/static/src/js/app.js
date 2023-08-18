odoo.define("whatsapp_connector_crm.acrux_chat", (function(require) {
    "use strict";
    var chat = require("whatsapp_connector.chat_classes"), AcruxChatAction = require("whatsapp_connector.acrux_chat").AcruxChatAction, QWeb = require("web.core").qweb;
    return AcruxChatAction.include({
        events: _.extend({}, AcruxChatAction.prototype.events, {
            "click li#tab_crm_lead": "tabCrmLead"
        }),
        _initRender: function() {
            return this._super().then((() => {
                this.$tab_content_lead = this.$("div#tab_content_crm_lead > div.o_group");
            }));
        },
        tabCrmLead: function(_event, data) {
            let out = Promise.reject();
            if (this.selected_conversation) if (this.selected_conversation.isMine()) {
                let lead_id = this.selected_conversation.crm_lead_id;
                this.saveDestroyWidget("crm_lead_form");
                let options = {
                    context: this.action.context,
                    crm_lead: lead_id,
                    action_manager: this.action_manager,
                    searchButton: !0
                };
                this.crm_lead_form = new chat.CrmLeadForm(this, options), this.$tab_content_lead.empty(), 
                out = this.crm_lead_form.appendTo(this.$tab_content_lead);
            } else this.$tab_content_lead.html(QWeb.render("acrux_empty_tab", {
                notYourConv: !0
            })); else this.$tab_content_lead.html(QWeb.render("acrux_empty_tab"));
            return out.then((() => data && data.resolve && data.resolve())), out.catch((() => data && data.reject && data.reject())), 
            out;
        },
        tabsClear: function() {
            this._super(), this.saveDestroyWidget("crm_lead_form");
        },
        _getMaximizeTabs: function() {
            let out = this._super();
            return out.push("#tab_content_crm_lead"), out;
        }
    }), AcruxChatAction;
})), odoo.define("whatsapp_connector_crm.chat_classes", (function(require) {
    "use strict";
    var chat = require("whatsapp_connector.chat_classes");
    return _.extend(chat, {
        CrmLeadForm: require("whatsapp_connector_crm.crm_lead")
    });
})), odoo.define("whatsapp_connector_crm.conversation", (function(require) {
    "use strict";
    var Conversation = require("whatsapp_connector.conversation");
    return Conversation.include({
        init: function(parent, options) {
            this._super.apply(this, arguments), this.crm_lead_id = this.options.crm_lead_id || [ !1, "" ];
        }
    }), Conversation;
})), odoo.define("whatsapp_connector_crm.crm_lead", (function(require) {
    "use strict";
    var session = require("web.session"), CrmLeadForm = require("whatsapp_connector.form_view").extend({
        init: function(parent, options) {
            options && (options.model = "crm.lead", options.record = options.crm_lead), this._super.apply(this, arguments), 
            this.parent = parent;
            const default_values = {
                default_partner_id: this.parent.selected_conversation.res_partner_id[0],
                default_phone: this.parent.selected_conversation.number_format,
                default_mobile: this.parent.selected_conversation.number_format,
                default_name: this.parent.selected_conversation.connector_id[1] + ": " + this.parent.selected_conversation.name,
                default_contact_name: this.parent.selected_conversation.name,
                default_user_id: session.uid
            };
            this.parent.selected_conversation.team_id[0] && (default_values.default_team_id = this.parent.selected_conversation.team_id[0]), 
            _.defaults(this.context, default_values), this._context_hook();
        },
        start: function() {
            return this._super().then((() => this.parent.product_search.minimize()));
        },
        recordUpdated: function(record) {
            return this._super(record).then((() => {
                if (record && record.data && record.data.id) {
                    let crm_key, partner_key, partner_id, localData;
                    crm_key = this.acrux_form_widget.handle, localData = this.acrux_form_widget.model.localData, 
                    crm_key && (partner_key = localData[crm_key].data.partner_id), partner_key && (partner_id = localData[partner_key]), 
                    this.parent.setNewPartner(partner_id);
                }
            }));
        },
        recordChange: function(crm_lead) {
            return Promise.all([ this._super(crm_lead), this._rpc({
                model: this.parent.model,
                method: "write",
                args: [ [ this.parent.selected_conversation.id ], {
                    crm_lead_id: crm_lead.data.id
                } ],
                context: this.context
            }).then((isOk => {
                if (isOk) {
                    let result = [ crm_lead.data.id, crm_lead.data.name ];
                    this.parent.selected_conversation.crm_lead_id = result, this.record = result;
                }
            })) ]);
        },
        _getOnSearchChatroomDomain: function() {
            let domain = this._super();
            return domain.push([ "conversation_id", "=", this.parent.selected_conversation.id ]), 
            this.parent.selected_conversation.res_partner_id && this.parent.selected_conversation.res_partner_id[0] && (domain.unshift("|"), 
            domain.push([ "partner_id", "=", this.parent.selected_conversation.res_partner_id[0] ])), 
            domain;
        }
    });
    return CrmLeadForm;
}));