odoo.define("whatsapp_connector_facebook.conversation", (function(require) {
    "use strict";
    var Conversation = require("whatsapp_connector.conversation");
    return Conversation.include({
        isOwnerFacebook: function() {
            return [ "facebook", "instagram", "waba_extern" ].includes(this.connector_type);
        },
        isWabaExtern: function() {
            return "waba_extern" === this.connector_type;
        },
        getIconClass: function() {
            let out = "";
            return out = "facebook" === this.connector_type ? "acrux_messenger" : "instagram" === this.connector_type ? "acrux_instagram" : "waba_extern" === this.connector_type ? "acrux_whatsapp" : this._super(), 
            out;
        }
    }), Conversation;
})), odoo.define("whatsapp_connector_facebook.form_view", (function(require) {
    "use strict";
    var FormView = require("whatsapp_connector.form_view");
    return FormView.include({
        _context_hook: function() {
            this._super(), [ "res.partner", "crm.lead" ].includes(this.model) && this.parent.selected_conversation && this.parent.selected_conversation.isOwnerFacebook() && !this.parent.selected_conversation.isWabaExtern() && ("default_mobile" in this.context && delete this.context.default_mobile, 
            "default_phone" in this.context && delete this.context.default_phone);
        }
    }), FormView;
})), odoo.define("whatsapp_connector_facebook.message", (function(require) {
    "use strict";
    var Message = require("whatsapp_connector.message"), Dialog = require("web.Dialog"), _t = require("web.core")._t;
    return Message.include({
        events: _.extend({}, Message.prototype.events, {
            "click .o_acrux_story_image": "openStoryImage"
        }),
        update: function(options) {
            if (this._super(options), this.url_due = options.url_due || !1, this.custom_url = options.custom_url || "", 
            "url" === this.ttype && this.text) {
                const sub_types = {
                    story_mention: _t("A story mention you.")
                };
                this.text in sub_types && (this.text = sub_types[this.text]);
            }
        },
        willStart: function() {
            let def = !1;
            return "url" === this.ttype && (this.url_due ? (this.res_model_obj = {
                display_name: _t("Story not found")
            }, this.res_model_obj.filename = this.res_model_obj.display_name) : def = this._rpc({
                model: "acrux.chat.message",
                method: "check_url_due",
                args: [ this.id ],
                context: this.context
            }).then((data => {
                this.url_due = data.url_due, this.url_due ? (this.res_model_obj = {
                    display_name: _t("Story not found")
                }, this.res_model_obj.filename = this.res_model_obj.display_name) : this.res_model_obj = data;
            }))), Promise.all([ this._super(), def ]);
        },
        _renderCustomObject: function() {
            let out = "";
            return out = "url" !== this.ttype || this.url_due ? this._super() : this.res_model_obj.mime.startsWith("image") ? `\n<div href=""\n    style="background-image:url('data:${this.res_model_obj.mime};base64,${this.res_model_obj.data}'); background-size: auto; cursor: pointer;"\n    data-mimetype="${this.res_model_obj.mime}" class="o_image o_hover o_acrux_img_fix o_acrux_story_image">\n</div>\n                ` : this.res_model_obj.mime.startsWith("video") ? `\n<video width="200" height="200" controls controlsList="nodownload">\n  <source src="data:${this.res_model_obj.mime};base64,${this.res_model_obj.data}" type="${this.res_model_obj.mime}">\n</video>\n                ` : `<i>${_t("Story not found.")}</i>`, 
            out;
        },
        openStoryImage: function() {
            var buttons = [ {
                text: _t("Ok"),
                close: !0
            } ];
            const url = `data:${this.res_model_obj.mime};base64,${this.res_model_obj.data}`;
            return new Dialog(this.conversation, {
                size: "large",
                buttons,
                $content: $(`\n<main style="text-align: center;">\n    <div href=""\n        style="background-image:url('${url}');width: auto;height: auto;"\n        data-mimetype="${this.res_model_obj.mime}" class="o_Attachment_image o_image o-attachment-viewable o-details-overlay o-medium o_acrux_story_image">\n        <img src="${url}" style="visibility: hidden;max-width: 100%; max-height: calc(100vh/1.5);" />\n    </div>\n</main>\n            `),
                title: _t("Alert"),
                fullscreen: !0
            }).open({
                shouldFocusButtons: !0
            });
        },
        canBeAnswered: function() {
            return this._super() && (!this.conversation.isOwnerFacebook() || this.conversation.isWabaExtern());
        },
        canBeDeleted: function() {
            return this._super() && !this.conversation.isOwnerFacebook();
        }
    }), Message;
})), odoo.define("whatsapp_connector_facebook.toolbox", (function(require) {
    "use strict";
    var Toolbox = require("whatsapp_connector.toolbox");
    return Toolbox.include({
        needDisableInput: function(attachment) {
            let out;
            return out = this.parent.selected_conversation && this.parent.selected_conversation.isOwnerFacebook() ? !this.parent.selected_conversation.isWabaExtern() || attachment.mimetype.includes("audio") : this._super(attachment), 
            out;
        }
    }), Toolbox;
}));