console.log('Node.JS server started\n '+
	'include:\n'+
	'WebSocket Server\n'+
	'Redis Server\n');
	// 'XMPP Server');

//npm install websocket
//npm install redis
//DON'T USE Hiredis (because its have bugs. 13.03.13)

//npm install -g xmpp-server (more info about config: https://github.com/superfeedr/xmpp-server/)
//npm install node-stringprep
//npm install node xmpp
// (shell) apt-get install libexpat1 libexpat1-dev libicu-dev
// npm install simple-xmpp
//npm install sha1
//for work with queues of RabbitMQ-Server:
// npm install amqp

// var xmppbot = require('./viblerbot');
// xmppbot.start();

var http=require('http');
var serverB = http.createServer(),
	serverR = http.createServer();

var sockJS = require('sockjs');
var sockServerB = sockJS.createServer(),
	sockServerR = sockJS.createServer();

//npm install redis
var redis = require('redis');
var rcPublisher = redis.createClient(),
	rcSetter = redis.createClient();

var sha1 = require('sha1');


var broadcasters={};
var receivers={};

//broadcaster server
sockServerB.on('connection',function(conn)
{
	console.log('user open connection1');

	conn.on('data',function(message)
	{
		console.log('conn1 message: '+message);
		core(message,conn);
	});
	conn.on('close',function()
	{
		console.log('user closed connection1');
	});
});
sockServerB.installHandlers(serverB);
serverB.listen(9998);

//receiver server
sockServerR.on('connection',function(conn)
{
	console.log('user open connection2');

	conn.on('data',function(message)
	{
		console.log('conn2 message: '+message);
		core(message,conn);
	});
	conn.on('close',function()
	{
		console.log('user closed connection2');
	});
});
sockServerR.installHandlers(serverR);
serverR.listen(9999);


	function core(message,connection)
		{
			var info = JSON.parse(message);
			console.log('from: '+info.clientType+'\naction: '+info.action);
			switch(info.clientType)
			{
				case 'broadcaster':
				{
					switch(info.action)
					{
						case 'wait_pair':
						{
							//TODO:добавить здесь защиту от захода двух бродкастеров
							var broadcasterAddr = sha1(Math.random());
							var subAddr = 'broadcastersWait'+broadcasterAddr;
							broadcasters[broadcasterAddr] = {
								redisClient: redis.createClient()
							};
							broadcasters[broadcasterAddr].channel = info.channel;
							// broadcasters[info.channel][broadcasterAddr] = redis.createClient();

							//ожидаем второго пира
							console.log('wait pair on channel: ' + info.channel);

							//TODO: здесь нужно записывать данные в разные ячейки
							var key = 'free_p2p_channel'+info.channel;
							rcSetter.lpush(key,broadcasterAddr);
							//alternative
							/**
							var free_channels[info.channel] = 'wait';
							*/

							sendMessage('wait_pair',{"status":"wait","broadcaster_addr":broadcasterAddr});
							broadcasters[broadcasterAddr].redisClient.on('message',function(chan,msg)
							{
								var msgObj = JSON.parse(msg);
								switch(msgObj.action)
								{
									case 'yourself_find':
									{
										console.log('broadcaster find pair');
										broadcasters[broadcasterAddr].receiver_addr = msgObj.content.receiver_addr;//true addr
										// console.log('contJSON: '+JSON.stringify(msgObj.content) );
										console.log('broadcaster[receiver_addr] = '+broadcasters[broadcasterAddr].receiver_addr);
										//address for new p2p (get from created broadcaster channel)
										// var p2p_addr = sha1(Math.random());
										var receiverSubAddr = 'receiverWait'+broadcasters[broadcasterAddr].receiver_addr;
										publishMessage(receiverSubAddr,'p2p_addr',{'p2p_addr':broadcasterAddr});
										// sendMessage('pair_finded',{'p2p_addr':p2p_addr});//moved to next case
										break;
									}
									//tunnel-level
									case 'getted_p2p_addr_and_need_sdp':
									{
										var getted_p2p_addr = msgObj.content;
										console.log('cont2: '+JSON.stringify(getted_p2p_addr) );
										sendMessage('pair_finded',getted_p2p_addr);
										break;
									}
									//p2p-level
									case 'sdp':
									{
										var cont = msgObj.content;
										// console.log('sdp5:\n'+JSON.stringify(cont) );//true address and sdp
										sendMessage('sdp',{'sdp':cont.sdp,'address':cont.p2p_addr});
										break;
									}
									//p2p-level
									case 'candidate':
									{
										var candidateCont = msgObj.content;
										// console.log('pub canidate getted');
										// console.log(candidateCont.candidate);//true address and candidate
										sendMessage('candidate',{'candidate':candidateCont.candidate,'address':candidateCont.address});
										break;
									}

									//closedConnection channel
									//tunnel-level
									case 'bye':
									{
										var contWithAddr = msgObj.content;
										// console.log('bye addr '+contWithAddr.address );
										delete broadcasters[contWithAddr.address];
										sendMessage('bye',msgObj.content);
										break;
									}
								}
							});

							broadcasters[broadcasterAddr].redisClient.subscribe(subAddr);
							break;
						}
						case 'candidate':
						{
							var cand = JSON.parse(info.content);
							if(cand.candidate !==null)
							{
								// console.log('b cand: '+cand.candidate);
								var receiverSubAddr = 'receiverWait'+broadcasters[cand.broadcaster_addr].receiver_addr;
								console.log('candidate sub addr: '+receiverSubAddr);
								publishMessage(receiverSubAddr,'candidate',{'candidate':cand.candidate});
							}
							break;
						}
						case 'end_candidates':
						{
							var cont = JSON.parse(info.content);
							// console.log('end_candidates '+broadcasters[cont.address].receiver_addr );
							//отписываемся от канала "поиск пар"
							broadcasters[cont.address].redisClient.unsubscribe(subAddr);
							//и подписываемся на канал "ожидание закрытия"
							//*для каждого ресивера свой отдельный канал
							var receiverAddrForClose = 'closedConnection'+broadcasters[cont.address].receiver_addr;
							broadcasters[cont.address].redisClient.subscribe(receiverAddrForClose);
							// delete broadcasters[broadcasterAddr];
							// rcSubscriberB = null;
							// console.log('end candidates');
							break;
						}
						case 'sdp':
						{
							var sdpCont = JSON.parse(info.content);
							console.log('sdp1: '+sdpCont.sdp);
							var bAddr = sdpCont.broadcaster_addr;
							var receiverSdpSubAddr = 'receiverWait'+broadcasters[bAddr].receiver_addr;
							publishMessage(receiverSdpSubAddr,'sdp',{'sdp':sdpCont,'broadcaster_addr':bAddr});
							break;
						}
						case 'bye':
						{
							var byeCont = JSON.parse(info.content);
							console.log('bye: '+byeCont.peers[0]);
							for(var p=0;p<byeCont.peers.length;p++)
							{
								if(byeCont.peers[p] in broadcasters)
								{
									console.log('Yes');
									// TODO: тут можно проверить, вся ли память освобождается
									var peerAddr = byeCont.peers[p];
									broadcasters[peerAddr].redisClient.unsubscribe('broadcastersWait'+peerAddr);
									broadcasters[peerAddr].redisClient.unsubscribe('closedConnection'+peerAddr);
									publishMessage('receiverWait'+broadcasters[peerAddr].receiver_addr,'bye',null);
									// broadcasters[peerAddr].redisClient.close();
									delete broadcasters[peerAddr];
								}
							}
							break;
						}
						default:
						{
							console.log('unknown broadcaster action type(action: '+info.action+' content: '+info.content);
							break;
						}
					}

					break;
				}//end broacdaster client type
				case 'receiver':
					{
						console.log('====R====');
						switch(info.action)
						{
							case 'find_pair':
							{
								var getKey = 'free_p2p_channel'+info.channel;

								rcSetter.lpop(getKey,function(err,res)
								{
									if(err)
									{
										console.log('===no find===');
										// отправляем команду "перезапросить позже"
										sendMessage('try_again',null);
										// return;
									}
									else
									{
										console.log('===ok===' + res);
										var newReceiverAddr = sha1(Math.random());
										receivers[newReceiverAddr] = {};
										sendMessage('your_receiver_address',
											{
												'address':newReceiverAddr,
												'broadcaster_addr':res
											});
									}
								});
								break;
							}
							case 'add_new_receiver':
							{
								var contNewReceiver = JSON.parse(info.content);
								var receiverAddr =  contNewReceiver.receiver_addr;
								var broadAddr = contNewReceiver.broadcaster_addr;
								var subBroadcasterAddr = 'broadcastersWait'+broadAddr;

								console.log('receiver_addr: '+receiverAddr);
								//проверка - выполнен ли предыдущий шаг ( где был добавлен индекс-адрес)
								if(receiverAddr in receivers)
								{
									receivers[receiverAddr].redisClient = redis.createClient();
									receivers[receiverAddr].redisClient.on('message',function(chan,mes)
									{
										var msgObj = JSON.parse(mes);
										switch(msgObj.action)
										{
											case 'p2p_addr':
											{
												var cont = msgObj.content;
												console.log('p2p_addr: '+cont.p2p_addr );
												sendMessage('p2p_addr',cont);//ok

												cont.broadcaster_addr = broadAddr;

												// console.log('cont: '+JSON.stringify(cont) );
												publishMessage(subBroadcasterAddr,'getted_p2p_addr_and_need_sdp',cont);
												break;
											}
											case 'sdp':
											{
												var sdp = msgObj.content;
												// console.log('sdp1:\n'+sdp.sdp);
												sendMessage('sdp',sdp.sdp);
												break;
											}
											case 'candidate':
											{
												var candidate = msgObj.content;
												// console.log('candidate: '+candidate);//true candidate
												if(candidate!==null && candidate!==undefined)
													{
														sendMessage('candidate',candidate);
													}
												break;
											}
											case 'bye':
											{
												//здесь дописать:
												//2. переключение ресивера на другой канал, после завершения "пробивки дыр"
												console.log(msgObj);
												var receiverForRemove = receiverAddr;
												console.log('receiver ' +receiverForRemove +' '+receiverAddr+ ' get bye');

												// console.log('peer addr: '+receiversAddresses[i]);//ok
												if(receiverForRemove in receivers)
												{
													//здесь отключаем ресивера и удаляем его из массива ресиверов
													try//POINT
													{
														receivers[receiverForRemove].redisClient.unsubscribe('receiverWait'+receiverForRemove);
														delete receivers[receiverForRemove];
														//отправляем юзер-агенту сообщение о том, 
														//что его бродкастер отключился
														sendMessage('bye',null);
														console.log('receiver removed success');
													}
													catch(e)
													{
														console.log('not find receiver for remove');
													}
												}
												break;
											}
										}
									});
									receivers[receiverAddr].redisClient.on('subscribe',function()
									{
										console.log('subs');
										//сообщаем бродкастеру, что его нашли, плюс отправляем ему адрес ресивер-тунеля
										// var subAddr = 'broadcastersWait'+broadcasterAddr;
										publishMessage(subBroadcasterAddr,'yourself_find',
											{'receiver_addr':receiverAddr,'broadcaster_addr':broadAddr});
									});
									receivers[receiverAddr].redisClient.subscribe('receiverWait'+receiverAddr);
								}
								else
								{
									console.log("receiver address not valid");
									sendMessage('error',{'error':"не верный адрес ресивера","code":0});
								}

									// publishMessage('broadcastersWait','yourself_find',null);//moved up
								// });
								break;
							}
							case 'sdp':
							{
								var sdpCont = JSON.parse(info.content);
								var bAddr = sdpCont.broadcaster_addr;
								var subBroadcasterAddr = 'broadcastersWait'+bAddr;
								publishMessage(subBroadcasterAddr,'sdp',sdpCont);
								break;
							}
							case 'candidate':
							{
								var candCont = JSON.parse(info.content);
								var bCandAddr = candCont.broadcaster_addr;
								var broadSubAddr = 'broadcastersWait'+bCandAddr;
								// console.log('candidate:\n'+info.content);//true candidate and address
								publishMessage(broadSubAddr,'candidate',JSON.parse(info.content));
								break;
							}
							case 'end_candidates':
							{
								// console.log('end candidates');
								var endCandCont = JSON.parse(info.content);

								if(endCandCont.receiver_addr in receivers)
								{
									receivers[endCandCont.receiver_addr].redisClient.unsubscribe('receiverWait');
									//POINT
									//TODO: сделать подписку для ресиверов
									// receivers[endCandCont.receiver_addr].redisClient.subscribe('closedConnection');
								}
								// if(rcSubscriber !==null)
								// {
								// 	rcSubscriber.unsubscribe('receiverWait');
								// 	rcSubscriber = null;
								// }
								break;
							}
							case 'bye':
							{
								var contObj = JSON.parse(info.content);
								console.log(contObj.address);
								if(contObj.receiver_addr in receivers)
								{
									var receiverAddrForClose = 'closedConnection'+contObj.receiver_addr;
									publishMessage(receiverAddrForClose,'bye',contObj);
									delete receivers[contObj.receiver_addr];
									console.log('deleted '+contObj.receiver_addr);
								}
								else
								{
									console.log('unfind receiver address');
								}
								console.log('bye info: '+info.content);
								break;
							}
							default:
							{
								console.log('unknown receiver action type '+ info.action);
								break;
							}
						}
						break;
					}
				//end receiver type client
				case 'relay':
				{
					console.log('====Relay====');
					switch(info.action)
					{
						//broadcaster-part
						case 'wait_pair':
						{
							// core(mes,con)
							var mes = info;
							console.log('relay: '+mes.client);
							// core()
						}

						//receiver-part
						case 'find_pair':
						{
							var getKey = 'free_p2p_channel'+info.channel;

							rcSetter.lpop(getKey,function(err,res)
							{
								if(err)
								{
									console.log('===no find===');
									// отправляем команду "перезапросить позже"
									sendMessage('try_again',null);
									// return;
								}
								else
								{
									console.log('===ok===' + res);
									var newReceiverAddr = sha1(Math.random());
									receivers[newReceiverAddr] = {};
									sendMessage('your_receiver_address',
										{
											'address':newReceiverAddr,
											'broadcaster_addr':res
										});
								}
							});
							break;
						}
						case 'add_new_receiver':
						{
							var contNewReceiver = JSON.parse(info.content);
							var receiverAddr =  contNewReceiver.receiver_addr;
							var broadAddr = contNewReceiver.broadcaster_addr;
							var subBroadcasterAddr = 'broadcastersWait'+broadAddr;

							console.log('receiver_addr: '+receiverAddr);
							//проверка - выполнен ли предыдущий шаг ( где был добавлен индекс-адрес)
							if(receiverAddr in receivers)
							{
								receivers[receiverAddr].redisClient = redis.createClient();
								receivers[receiverAddr].redisClient.on('message',function(chan,mes)
								{
									var msgObj = JSON.parse(mes);
									switch(msgObj.action)
									{
										case 'p2p_addr':
										{
											var cont = msgObj.content;
											console.log('p2p_addr: '+cont.p2p_addr );
											sendMessage('p2p_addr',cont);//ok

											cont.broadcaster_addr = broadAddr;

											// console.log('cont: '+JSON.stringify(cont) );
											publishMessage(subBroadcasterAddr,'getted_p2p_addr_and_need_sdp',cont);
											break;
										}
										case 'sdp':
										{
											var sdp = msgObj.content;
											// console.log('sdp1:\n'+sdp.sdp);
											sendMessage('sdp',sdp.sdp);
											break;
										}
										case 'candidate':
										{
											var candidate = msgObj.content;
											// console.log('candidate: '+candidate);//true candidate
											if(candidate!==null && candidate!==undefined)
												{
													sendMessage('candidate',candidate);
												}
											break;
										}
										case 'bye':
										{
											//здесь дописать:
											//2. переключение ресивера на другой канал, после завершения "пробивки дыр"
											console.log(msgObj);
											var receiverForRemove = receiverAddr;
											console.log('receiver ' +receiverForRemove +' '+receiverAddr+ ' get bye');

											// console.log('peer addr: '+receiversAddresses[i]);//ok
											if(receiverForRemove in receivers)
											{
												//здесь отключаем ресивера и удаляем его из массива ресиверов
												try//POINT
												{
													receivers[receiverForRemove].redisClient.unsubscribe('receiverWait'+receiverForRemove);
													delete receivers[receiverForRemove];
													//отправляем юзер-агенту сообщение о том, 
													//что его бродкастер отключился
													sendMessage('bye',null);
													console.log('receiver removed success');
												}
												catch(e)
												{
													console.log('not find receiver for remove');
												}
											}
											break;
										}
									}
								});
								receivers[receiverAddr].redisClient.on('subscribe',function()
								{
									console.log('subs');
									//сообщаем бродкастеру, что его нашли, плюс отправляем ему адрес ресивер-тунеля
									// var subAddr = 'broadcastersWait'+broadcasterAddr;
									publishMessage(subBroadcasterAddr,'yourself_find',
										{'receiver_addr':receiverAddr,'broadcaster_addr':broadAddr});
								});
								receivers[receiverAddr].redisClient.subscribe('receiverWait'+receiverAddr);
							}
							else
							{
								console.log("receiver address not valid");
								sendMessage('error',{'error':"не верный адрес ресивера","code":0});
							}

								// publishMessage('broadcastersWait','yourself_find',null);//moved up
							// });
							break;
						}
						case 'sdp':
						{
							var sdpCont = JSON.parse(info.content);
							var bAddr = sdpCont.broadcaster_addr;
							var subBroadcasterAddr = 'broadcastersWait'+bAddr;
							publishMessage(subBroadcasterAddr,'sdp',sdpCont);
							break;
						}
						case 'candidate':
						{
							var candCont = JSON.parse(info.content);
							var bCandAddr = candCont.broadcaster_addr;
							var broadSubAddr = 'broadcastersWait'+bCandAddr;
							// console.log('candidate:\n'+info.content);//true candidate and address
							publishMessage(broadSubAddr,'candidate',JSON.parse(info.content));
							break;
						}
						case 'end_candidates':
						{
							// console.log('end candidates');
							var endCandCont = JSON.parse(info.content);

							if(endCandCont.receiver_addr in receivers)
							{
								receivers[endCandCont.receiver_addr].redisClient.unsubscribe('receiverWait');
								//POINT
								//TODO: сделать подписку для ресиверов
								// receivers[endCandCont.receiver_addr].redisClient.subscribe('closedConnection');
							}
							// if(rcSubscriber !==null)
							// {
							// 	rcSubscriber.unsubscribe('receiverWait');
							// 	rcSubscriber = null;
							// }
							break;
						}
						case 'bye':
						{
							var contObj = JSON.parse(info.content);
							console.log(contObj.address);
							if(contObj.receiver_addr in receivers)
							{
								var receiverAddrForClose = 'closedConnection'+contObj.receiver_addr;
								publishMessage(receiverAddrForClose,'bye',contObj);
								delete receivers[contObj.receiver_addr];
								console.log('deleted '+contObj.receiver_addr);
							}
							else
							{
								console.log('unfind receiver address');
							}
							console.log('bye info: '+info.content);
							break;
						}
						default:
						{
							console.log('unknown receiver action type '+ info.action);
							break;
						}
					}
					break;
				}
				default:
				{
					console.log('unknown client type '+info.clientType);
				}
			}//end switch

		function sendMessage(action,message)
		{
			console.log('send message to client: '+message);
			// console.log("sendMessage(action: "+action+ ')\n');
			var messagePack = {};
			messagePack.action = action;
			messagePack.content = JSON.stringify(message);
			var msg = JSON.stringify(messagePack);

			connection.write(msg);
			// connection.end();
			// connection.emit(msg);
		}
	}

	function publishMessage(channel,action,message)
	{
		console.log('pub=>'+action);
		var messagePack = {};
		messagePack.action = action;
		messagePack.content = message;//JSON.stringify(message);
		var msg = JSON.stringify(messagePack);
		rcPublisher.publish(channel,msg);
	}



clientsInfo();
function clientsInfo()
{
	console.log('broadcasters\treceivers\n'+getLength(broadcasters)+'\t\t'+getLength(receivers));
	setTimeout(clientsInfo,1000);
}

//utils
function getLength(obj)
{
  var len = 0;
  for (var i in obj)
  {
    ++len;
  }
  return len;
}