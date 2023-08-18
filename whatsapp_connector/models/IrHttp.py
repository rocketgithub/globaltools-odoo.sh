# -*- coding: utf-8 -*-

from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        result = super(IrHttp, self).session_info()
        if self.env.user.has_group('whatsapp_connector.group_chat_basic_extra'):
            Config = self.env['ir.config_parameter'].sudo()
            result['chatroom_release_conv_on_close'] = bool(Config.get_param('chatroom.release.conv.on.close', False))
        return result
