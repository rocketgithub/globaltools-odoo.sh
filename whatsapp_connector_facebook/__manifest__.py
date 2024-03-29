# -*- coding: utf-8 -*-
# =====================================================================================
# License: OPL-1 (Odoo Proprietary License v1.0)
#
# By using or downloading this module, you agree not to make modifications that
# affect sending messages through Acruxlab or avoiding contract a Plan with Acruxlab.
# Support our work and allow us to keep improving this module and the service!
#
# Al utilizar o descargar este módulo, usted se compromete a no realizar modificaciones que
# afecten el envío de mensajes a través de Acruxlab o a evitar contratar un Plan con Acruxlab.
# Apoya nuestro trabajo y permite que sigamos mejorando este módulo y el servicio!
# =====================================================================================
{
    'name': 'ChatRoom Facebook/Instagram/Whatsapp Live Chat. Real All in One',
    'summary': 'Instagram DM & FaceBook Messenger chat in ChatRoom, Live Send and Receive. Send from many places. '
               'Instagram Direct Message IDM META ChatRoom 2.0.',
    'description': '''Instagram & FaceBook Messenger chat in ChatRoom, Live Send and Receive. Send from many places.
KEYS:
Chat Instagram Direct chat FaceBook chat Messenger Instagram chat IDM Instagram
integration Instagram integration Messenger integration
connector Instagram connector Messenger connector
    ''',
    'version': '13.0.9',
    'author': 'AcruxLab',
    'live_test_url': 'https://chatroom.acruxlab.com/web/signup',
    'support': 'info@acruxlab.com',
    'price': 0.0,
    'currency': 'USD',
    'images': ['static/description/Banner_facebook_v10.gif'],
    'website': 'https://acruxlab.com/plans-facebook',
    'license': 'OPL-1',
    'application': True,
    'installable': True,
    'category': 'Discuss/Sales/CRM',
    'depends': [
        'whatsapp_connector',
    ],
    'data': [
        'views/include_template.xml',
        'views/message_views.xml'
    ],
    'qweb': [
    ],
    'post_load': '',
    'external_dependencies': {},
}
