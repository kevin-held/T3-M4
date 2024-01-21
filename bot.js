// author: Kevin Held - kevinwaynheld@gmail.com - 2023

/* CONSTANTS / DECLARATIONS / INSTANCES */

const Eris = require('eris');
const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');

const configFile = 'config.json'; // JSON file to store configuration data

// Load configuration data from JSON (or set default values)
const configData = readJSON(configFile) || {
  prefix: '!', // Default prefix
  timezone: 'America/New_York', // Default timezone (EST)
  authorId: '555228695799791641', // Default author ID @awkwardsnake on Discord
  log: 'log.txt',
};

// IMPORTANT - set up your own api keys
// run  '$> npm install dotenv'.
// then '$> "DISCORD_API_KEY=your_discord_api_key" > .env
// then '$> "OPENAI_API_KEY=your_openai_api_key" >> .env
require('dotenv').config();
const bot = new Eris(process.env.DISCORD_API_KEY);

// Assign constants using configuration data
const prefix = configData.prefix;
const defaultTimezone = configData.timezone;
const AUTHORID = configData.authorId;
const log = configData.log;
const logStream = fs.createWriteStream(log, { flags: 'a' });

// Commands object
const commands = {
  prefix: {
    description: `Change the prefix for commands. Currently set to ${prefix}`,
    usage: 'prefix',
    execute: async (message, args) => {
      try {
        configData.prefix = args[0];
        logStream.write(`Prefix changed to ${prefix}`);
        await bot.createMessage(message.channel.id, `Prefix changed to ${prefix}`);
      } catch (error) {
        handleError(message.channel.id, 'Error in prefix command');
      }
    },
  }, 
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
        handleError(message.channel.id, 'Error in nextrace command');
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
      if (message.author.id === AUTHORID) {
        message.channel.createMessage(`${message.author.mention} is restarting the bot...`).then(() => {
          process.exit(0); // Gracefully exit the Node.js process to trigger a restart 
        });
      } else {
        message.channel.createMessage(`${message.author.mention} You do not have permission to restart the bot.`);
      }
    },
  },
};

/* JSON FUNCTIONS */

function readJSON(filename) {
  try {
    const jsonData = fs.readFileSync(filename, 'utf-8');
    return JSON.parse(jsonData);
  } catch (error) {
    console.error(`Error reading JSON file '${filename}':`, error);
    logStream.write(`Error reading JSON file '${filename}':`, error);
    return null;
  }
}

function writeJSON(filename, data) {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filename, jsonData, 'utf-8');
    console.log(`Data has been written to ${filename}`);
    logStream.write(`Data has been written to ${filename}`);
  } catch (error) {
    console.error(`Error writing to JSON file '${filename}':`, error);
    logStream.write(`Error writing to JSON file '${filename}':`, error);
  }
}

/* FUNCTIONS */

async function reply(message) {
  try {
    await generateChatGptResponse(message);
  } catch (error) {
    handleError(message.channel.id, "Error in reply");
  }
}

function sanitize(message) {
  return message.replace("@T3-M4", "").replace("#2003","").replace("<@1130970349740228750>","").trim();
}

async function generateChatGptResponse(message) {
  try {
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
      messages: [
        { role: 'system', content: systemContent },
        { role: 'system', content: recentChat },
        { role: 'user', content: sanitize(message.content) },
      ],
      temperature: 0.7,
    };

    await axios.post(endpoint, data, { headers }).then((response) => {
      bot.createMessage(message.channel.id, response.data.choices[0].message.content);
      logStream.write(response.data.choices[0].message.content + "\n");
      // console.log('Response:', response.data);
      return response.data.choices[0].message.content;
    });

  } catch (error) {
    handleError(0, `Error in generateChatGptResponse ${error}\n`);
  }
}

function createRaceEmbed(raceData, qualifyingData, sprintData, timezone) {
  const raceTime = moment
    .tz(raceData.date + ' ' + raceData.time, 'YYYY-MM-DD HH:mm', 'UTC')
    .tz(timezone)
    .format('dddd, MMM D HH:mm');

  const qualifyingTime =  moment
    .tz(raceData.Qualifying.date + ' ' + raceData.Qualifying.time, 'YYYY-MM-DD HH:mm', 'UTC')
    .tz(timezone)
    .format('dddd, MMM D HH:mm');

  const raceEmbed = {
    title: raceData.raceName + " (" + raceData.Circuit["circuitName"] + ")",
    fields: [
      { name: 'Race:', value: raceTime, inline: true },
      { name: 'Qualifying:', value: qualifyingTime, inline: true  },
      { name: 'Sprint:', value: 'none', inline: true  },
    ],
    color: 0xff0000,
    footer: { text: 'Timezone set to EST. Data provided by Ergast' },
  };

  return raceEmbed;
}

async function getRaceData() {
  const response = await axios.get('https://ergast.com/api/f1/current/next.json');
  return response.data.MRData.RaceTable.Races[0];
}

async function getEventData(season, round, event) {
  try {
    const response = await axios.get(`https://ergast.com/api/f1/${season}/${round}/${event}.json`);
    return response.data.MRData.RaceTable.Races[0];
  } catch (error) {
    handleError(0,"Error in getEventData");
    return null;
  }
}

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

    const recentMessage = `[${new Date().toLocaleString()}] ${message.channel.name}#${message.channel.id}:${message.author.username}: ${message.content}\n`;
    const channelString = message.channel.name + "#" + message.channel.id;
    const authorString = message.author.username + "#" + message.author.id;

    addMessageToRecent(channelString, authorString, message.content);

    if (message.mentions.find((mention) => mention.id === bot.user.id)) {
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
    handleError(message.channel.id, "Error in bot.on");
  }
});

bot.on('ready', () => {
  console.log(`Logged in as ${bot.user.username}!`);
  logStream.write(`Logged in as ${bot.user.username}!\n`);
});

bot.on('disconnect', () => {
  logStream.end();
});

bot.connect();

