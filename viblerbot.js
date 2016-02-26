var xmpp = require('simple-xmpp');

xmpp.on('online',function()
{
	console.log("Vibler bot said: I'm connected!");

	xmpp.probe('retrans@78.47.138.227', function(state)
	{
		console.log('probe: '+state);
		// console.log(state == xmpp.STATUS.ONLINE);
	});
});
xmpp.on('chat',function(from,message)
{
	// console.log('bot<-message:');
	// console.log(message.split('\n'));//ok
	//разделяем сообщение на нужное и ненужное (адрес получения и само сообщение), по символу переноса строки
	var msg = message.split('\n');
	// xmpp.send(from,'Vibler bot said: I get your message('+message+')');

	//проверяем, чего хочет юзер
	switch(msg[1])//проверка по самому сообщению
	{
		case "get_me_broadcaster_stream":
		{
			console.log('user '+ from +' need broadcaster stream...');
			xmpp.send(from,'ok');
			break;
		}
		default: break;
	}
});


xmpp.on('error',function(err)
{
	console.error('Vibler bot error: '+err);
});
xmpp.on('subscribe',function(from)
{
	xmpp.acceptSubscription(from);
	xmpp.subscribe(from);
	console.log('Vibler bot accepted subscribe from '+from +' and subscribed oneself');
});



xmpp.on('buddy', function(jid, state) {
    // console.log('buddy: '+jid +' state: '+state);
});

xmpp.on('stanza',function(stanza)
{
	// console.log('stanza: \n'+stanza);
	 // var state = (stanza.getChild('show'))? stanza.getChild('show').getText(): STATUS.ONLINE;
	 // console.log('stanza state: '+state);
});


function start()
{
	xmpp.connect({
		jid: 'viblerbot@78.47.138.227',
		password:'viblerbot',
		host: '78.47.138.227',
		port: 5222
	});
}

exports.start = start;