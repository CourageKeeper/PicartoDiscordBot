README

This is version 2 of the Picarto/Discord interface bot.
The two primary differences between the test version and this are:

1. It uses NeDB as an in-memory database to manage the servers, streamers, and their online states.

2. It interfaces with Picarto's public API, allowing it to be configured by the end users.

Description:

The Picarto We're Live! bot allows a Discord server owner to join the bot to their channel and set it up to notify a text channel when a streamer goes live on Picarto.tv.

How to use:

Add this  bot to your server with this link: https://discordapp.com/oauth2/authorize?permissions=150528&scope=bot&client_id=303296629396733953

This will ensure that it has the needed permissions to work (Read Messages, Send Messages, Mention Everyone, Embed Links). It will work without the Embed Links permission if you would like the messages to be compacted, but it will fail without the others.

Currently the bot uses @here to announce streams and will fail if Mention Everyone is not allowed.

Once this bot has been added to a server, it will need to be configured for each streamer. Send it a DM via Discord to get started. It will respond to your messages and walk you through setting up a streamer. Once you get the hang of things, try the [quickadd] command to speed things up if you're adding multiple streamers.

It defaults to the default text channel that is first created with the server. To choose the channel, use the [setBotChannel] command and give it the channel ID you'd like to use.

If you run into any problems you may either DM me on Discord, open an issue on GitHub, or send an email to dannfirefeet[at]gmail.com if you prefer.
