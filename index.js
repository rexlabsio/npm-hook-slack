var
	assert       = require('assert'),
	bole         = require('bole'),
	logstring    = require('common-log-string'),
	makeReceiver = require('npm-hook-receiver'),
	slack        = require('@slack/client')
	;

var logger = bole(process.env.SERVICE_NAME || 'hooks-bot');
bole.output({ level: 'info', stream: process.stdout });

var token = process.env.SLACK_API_TOKEN || '';
assert(token, 'you must supply a slack api token in process.env.SLACK_API_TOKEN');
var channelID = process.env.SLACK_CHANNEL;
assert(channelID, 'you must supply a slack channel ID in process.env.SLACK_CHANNEL');
var port = process.env.PORT || '6666';

// This is how we post to slack.
var web = new slack.WebClient(token);

// We can post the generic bot, or attempt to post as an inferred bot user.
// If enabled, the bot user must be in the channel.
var defaultMessageOpts = {
	as_user: process.env.INFER_BOT_USER ? true : false
};

// Make a webhooks receiver and have it act on interesting events.
// The receiver is a restify server!
var opts = {
	name:   process.env.SERVICE_NAME || 'hooks-bot',
	secret: process.env.SHARED_SECRET,
	mount:  process.env.MOUNT_POINT || '/incoming',
};
var server = makeReceiver(opts);

// All hook events, with special handling for some.
server.on('hook', function onIncomingHook(hook)
{
	var pkg = hook.name.replace('/', '%2F');
	var type = hook.type;
	var change = hook.event.replace(type + ':', '');

	var message, highlightedVersion;
	logger.info('hook', JSON.stringify(hook));
	var user = hook.change ? hook.change.user : '';
	var maintainer = hook.change.maintainer;

	switch (hook.event)
	{
	case 'package:star':
		message = `:package::star: *starred* by <https://www.npmjs.com/~${user}|${user}>`;
		break;

	case 'package:unstar':
		message = `:package::disappointed: *unstarred* by <https://www.npmjs.com/~${user}|${user}>`;
		break;

	case 'package:publish':
		highlightedVersion = hook.change.version;
		message = `:package::sparkles: *published* version ${hook.change.version}`;
		break;

	case 'package:unpublish':
		highlightedVersion = hook.change.version;
		message = `:package::wave: *unpublished* version ${hook.change.version}`;
		break;

	case 'package:deprecated':
		highlightedVersion = hook.change.deprecated;
		message = `:package::skull_and_crossbones: *deprecated* version ${hook.change.deprecated}`;
		break;

	case 'package:undeprecated':
		highlightedVersion = hook.change.deprecated;
		message = `:package::worried: *undeprecated* version ${hook.change.deprecated}`;
		break;

	case 'package:dist-tag':
		var distTag = hook.change['dist-tag'];
		highlightedVersion = hook.payload['dist-tags'][distTag];
		message = `:package::label: added a *dist-tag*: \`${distTag}\``;
		break;

	case 'package:dist-tag-rm':
		message = `:package::fire: removed a *dist-tag*: \`${hook.change['dist-tag']}\``;
		break;

	case 'package:owner':
		message = `:package::information_desk_person: added an owner: <https://www.npmjs.com/~${maintainer}|\`${maintainer}\`>`;
		break;

	case 'package:owner-rm':
		message = `:package::no_good: removed an owner: <https://www.npmjs.com/~${maintainer}|\`${maintainer}\`>`;
		break;

	default:
		message = `:package: *event*: \`${change}\` | *type*: \`${type}\``;
	}

	var attachment = {
		fallback: `name: '${pkg}' | event: '${change}' | type: '${type}'`,
		text: `_${message}_`,
		color: '#cb3837',
		title: pkg,
		title_link: `https://www.npmjs.com/package/${pkg}`,
		mrkdwn_in: [ 'text', 'pretext' ]
	};

	if (highlightedVersion) {
		attachment.author_name = highlightedVersion;
	}

	var messageOpts = Object.assign({ attachment: attachment }, defaultMessageOpts);
	logger.info('message', JSON.stringify(messageOpts));
	web.chat.postMessage(channelID, '', messageOpts);
});

server.on('hook:error', function(message)
{
	web.chat.postMessage(channelID, '*error handling web hook:* ' + message, defaultMessageOpts);
});

// now make it ready for production

server.on('after', function logEachRequest(request, response, route, error)
{
	logger.info(logstring(request, response));
});

server.get('/ping', function handlePing(request, response, next)
{
	response.send(200, 'pong');
	next();
});

server.listen(port, function()
{
	logger.info('listening on ' + port);
});
