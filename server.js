const { Client, Intents } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const { token, prefix } = require('./config.json');

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES] });

const queue = new Map();

client.once('ready', () => {
    console.log('Bot is online!');
});

client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const serverQueue = queue.get(message.guild.id);

    if (command === 'play') {
        execute(message, serverQueue);
    } else if (command === 'stop') {
        stop(message, serverQueue);
    } else {
        message.channel.send('Invalid command!');
    }
});

async function execute(message, serverQueue) {
    const args = message.content.split(' ');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.channel.send('You need to be in a voice channel to play music!');
    const permissions = voiceChannel.permissionsFor(client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        return message.channel.send('I need the permissions to join and speak in your voice channel!');
    }

    const songInfo = await ytdl.getInfo(args[1]);
    const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
    };

    if (!serverQueue) {
        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            player: null,
            songs: [],
            volume: 5,
            playing: true,
        };

        queue.set(message.guild.id, queueContruct);
        queueContruct.songs.push(song);

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            queueContruct.connection = connection;

            const player = createAudioPlayer();
            queueContruct.player = player;

            connection.on(VoiceConnectionStatus.Ready, () => {
                play(message.guild, queueContruct.songs[0]);
            });

            connection.subscribe(player);
        } catch (err) {
            console.error(err);
            queue.delete(message.guild.id);
            return message.channel.send(err.message ? `Error: ${err.message}` : 'An error occurred while trying to play the song.');
        }
    } else {
        serverQueue.songs.push(song);
        return message.channel.send(`${song.title} has been added to the queue!`);
    }
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const stream = ytdl(song.url, { filter: 'audioonly', opusEncoded: true });
    const resource = createAudioResource(stream, { inputType: 'opus' });

    serverQueue.player.play(resource);

    serverQueue.player.on(AudioPlayerStatus.Idle, () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
    });

    serverQueue.player.on(AudioPlayerStatus.Error, error => {
        console.error(error);
        serverQueue.textChannel.send(`Error playing ${song.title}: ${error.message}`);
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
    });

    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel) return message.channel.send('You have to be in a voice channel to stop the music!');
    if (!serverQueue) return message.channel.send('There is no song that I could stop!');

    serverQueue.songs = [];
    serverQueue.player.stop();
    serverQueue.connection.destroy();
    queue.delete(message.guild.id);
}

client.login(process.env.t);
