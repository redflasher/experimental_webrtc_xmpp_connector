Задача кода:
организовывать видео-стриминговую сеть из webrtc-пиров, с целью избавиться от использования медиа-серверов в архитектуре видео-стримингового сервиса.

Результат: не реализованная задача, т.к. webrtc еще слишком "сырой".

Код использует следующий стек: js/node.js, xmpp/websocket(для обмена сообщениями-рукопожатиями между пирами), redis(в качестве скоростной бд).

P.S. к серверной части прилагался так же клиентский js-код.