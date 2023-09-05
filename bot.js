const Eris = require('eris');
const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');

const bot = new Eris('MTEzMDk3MDM0OTc0MDIyODc1MA.GVmbHK.LXc2ktU39WgEj-LpS8qrN9_NW80SA2JnciWlIg');
const prefix = '!';
const defaultTimezone = 'America/New_York';

// Set your OpenAI API key
const apiKey = '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';


// Open the file for appending (creates the file if it doesn't exist)
const logFilePath = 'recent.txt';
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });


bot.on('ready', () => {
  console.log(`Logged in as ${bot.user.username}!`);
});

const commands = {
  nextrace: {
    description: 'Get information about the next Formula 1 race.',
    usage: 'nextrace',
    execute: async (message) => {
      try {
        const timezone = defaultTimezone;
        const raceData = await fetchRaceData();
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
      // Check if the user has permission to restart the bot (you can add your own logic here)
      if (message.author.id === '555228695799791641') {
        message.channel.createMessage(`${message.author.mention} is restarting the bot...`).then(() => {
          // Gracefully exit the Node.js process to trigger a restart 
          process.exit(0);
		  
        });
      } else {
        message.channel.createMessage(`${message.author.mention} You do not have permission to restart the bot.`);
      }
    },
  },
};

bot.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return; // Ignore messages from other bots
	
	// update recent.txt
	// Format the message data (e.g., timestamp, author, content)
	const logMessage = `[${new Date().toLocaleString()}] ${message.author.username}: ${message.content}\n`;

	// Write the message to the log file
	logStream.write(logMessage, (err) => {
	if (err) {
		console.error('Error writing to log file:', err);
	}
	});

    // Check if the message mentions the bot
    if (message.mentions.find((mention) => mention.id === bot.user.id)) {
      // Reply with a simple message when mentioned
      reply(message);
      return;
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = commands[commandName];
    if (!command) {
      bot.createMessage(message.channel.id, "Invalid command. Use `!help` to see available commands.");
      return;
    }

    command.execute(message);
  } catch (error) {
    handleError(message.channel.id);
  }
});


// Function to reply with a simple message
async function reply(message) {
  //bot.createMessage(message.channel.id, `Hello, ${message.author.mention}! How can I assist you?`);
  try {
		var reply = "error";
        // Generate a response from ChatGPT
		const chatGptResponse = await generateChatGptResponse(message.content).then(response => {
			console.log('User content:', message.content);
			console.log('Assistant Response:', response);
			reply = response;
			
		}).catch(error => {
			console.error('Error:', error);
		});
        await bot.createMessage(message.channel.id, reply); // Send the ChatGPT response
      } catch (error) {
        handleError(message.channel.id);
      }
}

const endpoint = 'https://api.openai.com/v1/chat/completions';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
};



// Function to generate a response using OpenAI API
async function generateChatGptResponse(userInput) {
	var message = "error";
	const systemContent = fs.readFileSync('context.txt', 'utf-8').trim();
	const recentChat = fs.readFileSync('recent.txt', 'utf-8').trim();
	const data = {
		model: 'gpt-3.5-turbo',
		messages: [
			{
				role: 'system',
				content: systemContent,
			}, {
				role: 'system',
				content: recentChat,
			}, {
				role: 'user',
				content: userInput,
			}
		],
		temperature: 0.7,
	};
	await axios.post(endpoint, data, { headers }).then((response) => {
		message = response.data.choices[0].message.content;
		console.log('Response:', response.data);
	})
	return message
}

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
      { name: 'Sprint:', value: 'none', inline: true  }, // \u200B is a zero-width space
    ],
    color: 0xff0000,
    footer: { text: 'Timezone EST. Data provided by Ergast Developer API' },
  };

  return raceEmbed;
}


function createRaceEmbedOLD(raceData, qualifyingData, sprintData, timezone) {
  const formatTime = (time) =>
    moment
      .tz(time, 'YYYY-MM-DD HH:mm', 'UTC')
      .tz(timezone)
      .format('YYYY-MM-DD HH:mm');

  const raceTime = formatTime(raceData.date + ' ' + raceData.time);

  const raceEmbed = {
    title: 'Next Formula 1 Race',
    fields: [
      { name: 'Race Name', value: raceData.raceName },
      { name: 'Race Date', value: raceTime.split(' ')[0] },
      { name: 'Race Time', value: raceTime.split(' ')[1] },
      { name: 'Race Timezone', value: timezone },
    ],
    color: 0xff0000,
    footer: { text: 'Race data provided by Ergast Developer API' },
  };

  if (qualifyingData) {
    const qualifyingTime = formatTime(qualifyingData.date + ' ' + qualifyingData.time);
    raceEmbed.fields.push(
      { name: 'Qualifying Date', value: qualifyingTime.split(' ')[0] },
      { name: 'Qualifying Time', value: qualifyingTime.split(' ')[1] }
    );
  } else {
    raceEmbed.fields.push({ name: 'Qualifying', value: 'No qualifying event information available.' });
  }

  if (sprintData) {
    const sprintTime = formatTime(sprintData.date + ' ' + sprintData.time);
    raceEmbed.fields.push(
      { name: 'Sprint Race Date', value: sprintTime.split(' ')[0] },
      { name: 'Sprint Race Time', value: sprintTime.split(' ')[1] }
    );
  } else {
    raceEmbed.fields.push({ name: 'Sprint Race', value: 'No sprint race information available.' });
  }

  return raceEmbed;
}

async function fetchRaceData() {
  const response = await axios.get('https://ergast.com/api/f1/current/next.json');
  return response.data.MRData.RaceTable.Races[0];
}

async function getEventData(season, round, event) {
  try {
    const response = await axios.get(`https://ergast.com/api/f1/${season}/${round}/${event}.json`);
    return response.data.MRData.RaceTable.Races[0];
  } catch (error) {
    return null;
  }
}

function handleError(channelId) {
  console.error('An error occurred');
  bot.createMessage(channelId, 'An error occurred. Please try again later.');
}

bot.on('disconnect', () => {
  // Close the log file
  logStream.end();
});

bot.connect();