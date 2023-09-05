// Kevin Held - kevinwaynheld@gmail.com - 2023


/* DECLARATIONS / INSTANCES */

const Eris = require('eris');
const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');

// IMPORTANT - set up your own api key
// run '$ npm install dotenv'.
// then '$ echo "DISCORD_API_KEY=your_discord_api_key" > .env
// then '$ echo "OPENAI_API_KEY=your_openai_api_key" >> .env
require('dotenv').config();

const discordApiKey = process.env.DISCORD_API_KEY; // get the keys from the .env file
const openaiApiKey = process.env.OPENAI_API_KEY;  

const bot = new Eris(discordApiKey);

// change manually or implement todos...
const prefix = '!'; // TODO: add a command to change the prefix
const defaultTimezone = 'America/New_York'; // TODO: add a command to set the Timezone.
const AUTHORID = '555228695799791641' // Discord author id, belonging to awkwardsnake, aka me. used to restart the bot. TODO: change to admin role discord const or something.
const log = 'log.txt'
const recentChats = 'recent.txt';
// ....

const recentStream = fs.createWriteStream(recentChats, { flags: 'a' });
const logStream = fs.createWriteStream(log, { flags: 'a' });

const commands = {
	nextrace: {
		description: 'Get information about the next Formula 1 race.',
		usage: 'nextrace',
		execute: async (message) => {
			try {
				const timezone = defaultTimezone;
				const raceData = await getRaceData();
				const qualifyingData = await getEventData(raceData.season, raceData.round, 'qualifying');
				const sprintData = await getEventData(raceData.season, raceData.round, 'sprint');
				const raceEmbed = createRaceEmbed(raceData, qualifyingData, sprintData, timezone);
				await bot.createMessage(message.channel.id, { embed: raceEmbed });
			} catch (error) {
				handleError(message.channel.id);
			}
		},
	}, 
	help: {
		description: 'Show a list of available commands.',
		usage: 'help',
		execute: (message) => {
			const commandList = Object.keys(commands).map((command) => `**${prefix}${command}**: ${commands[command].description}`);
			const helpMessage = `Here is a list of available commands:\n\n${commandList.join('\n')}`;
			bot.createMessage(message.channel.id, helpMessage);
		},
	},
	restart: {
		description: 'Restart the bot.',
		usage: 'restart',
		execute: (message) => {
			// Check if the user has permission to restart the bot (TODO: change to use role in server instead of id)
			if (message.author.id === AUTHORID) {
				message.channel.createMessage(`${message.author.mention} is restarting the bot...`).then(() => {
				// Gracefully exit the Node.js process to trigger a restart 
				process.exit(0);

			});
			} else {
				message.channel.createMessage(`${message.author.mention} You do not have permission to restart the bot.`);
			}
		},
	},
	// ***additional commands can be added here*** 
};


/* FUNCTIONS */

// Function to reply with a simple message or chatGPT if possible.
async function reply(message) {
	try {
		// Generate a response from ChatGPT
		const chatGptResponse = await generateChatGptResponse(message)
		
	} catch (error) {
		handleError(message.channel.id, "Error in reply");
	}
}

function sanitize(message){
	return message.replace("@T3-M4", "").replace("#2003","").replace("<@1130970349740228750>","").trim();
}



// Function to generate a response using OpenAI API
async function generateChatGptResponse(message) {
	try{
		logStream.write(sanitize(message.content) + "\n");
		const systemContent = fs.readFileSync('context.txt', 'utf-8').trim();
		const recentChat = fs.readFileSync('recent.txt', 'utf-8').trim();
		const endpoint = 'https://api.openai.com/v1/chat/completions';
		const headers = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${openaiApiKey}`,
		};
		const data = {
			model: 'gpt-3.5-turbo',
			// TODO: incorporate recentChats into message list correctly.
			messages: [
				{
					role: 'system',
					content: systemContent,
				}, {
					role: 'system',
					content: recentChat,
				}, {
					role: 'user',
					content: sanitize(message.content),
				}
			],
			temperature: 0.7,
		};


		await axios.post(endpoint, data, { headers }).then((response) => {
			bot.createMessage(message.channel.id, response.data.choices[0].message.content);
			logStream.write(response.data.choices[0].message.content + "\n");
			//console.log('Response:', response.data);
			return response.data.choices[0].message.content;
		});

	} catch (error) {
		handleError(0,`Error in generateChatGptResponse ${error}\n`);
	}
}


// Format of the Race Embed here
function createRaceEmbed(raceData, qualifyingData, sprintData, timezone) {
	const raceTime = moment
		.tz(raceData.date + ' ' + raceData.time, 'YYYY-MM-DD HH:mm', 'UTC')
		.tz(timezone)
		.format('dddd, MMM D HH:mm');

	const qualifyingTime =  moment
		.tz(raceData.Qualifying.date+ ' ' + raceData.Qualifying.time, 'YYYY-MM-DD HH:mm', 'UTC')
		.tz(timezone)
		.format('dddd, MMM D HH:mm');

	const raceEmbed = {
		title: raceData.raceName + " (" + raceData.Circuit["circuitName"] + ")",
		fields: [
			{ name: 'Race:', value: raceTime, inline: true },
			{ name: 'Qualifying:', value: qualifyingTime, inline: true  },
			{ name: 'Sprint:', value: 'none', inline: true  }, // TODO: get sprint data when its available
		],
		color: 0xff0000,
		footer: { text: 'Timezone set to EST. Data provided by Ergast' },
	};

	return raceEmbed;
}
// Get race data from ergast
async function getRaceData() {
	const response = await axios.get('https://ergast.com/api/f1/current/next.json');
	return response.data.MRData.RaceTable.Races[0];
}

// Get event data from ergast 
async function getEventData(season, round, event) {
	try {
		const response = await axios.get(`https://ergast.com/api/f1/${season}/${round}/${event}.json`);
		return response.data.MRData.RaceTable.Races[0];
	} catch (error) {
		handleError(0,"Error in getEventData");
		return null;
	}
}

// Error handler
function handleError(channelId = 0, logMessage = "An error has occurred. ") {
	console.error(logMessage);
	if (channelId){
		bot.createMessage(channelId, logMessage);
	}
	logStream.write(logMessage + "\n");
}



/* LISTENERS */

bot.on('messageCreate', async (message) => {
	try {
		if (message.author.bot) return; // Ignore messages from other bots

		// update recent.txt
		// Format the message data (e.g., timestamp, author, content)
		const recentMessage = `[${new Date().toLocaleString()}] ${message.author.username}: ${message.content}\n`;

		// write the message to the recent.txt file
		recentStream.write(recentMessage);

		// if the message mentions the bot
		if (message.mentions.find((mention) => mention.id === bot.user.id)) {
			// Reply with a simple message when mentioned
			reply(message);
			return;
		}

		
		if (!message.content.startsWith(prefix)) return;
		// if command with prefix (!)
		const args = message.content.slice(prefix.length).trim().split(/ +/);
		const commandName = args.shift().toLowerCase();
		const command = commands[commandName];
		if (!command) {
			bot.createMessage(message.channel.id, "Invalid command. Use `!help` to see available commands.");
			return;
		}
		command.execute(message);
		
	} catch (error) {
		handleError(message.channel.id, "Error in bot.on");
	}
});

bot.on('ready', () => {
	console.log(`Logged in as ${bot.user.username}!`);
	logStream.write(`Logged in as ${bot.user.username}!\n`);
});

bot.on('disconnect', () => {
	recentStream.end();
	logStream.end();
});

bot.connect();