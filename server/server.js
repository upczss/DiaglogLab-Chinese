import { continueAfterApprovals } from './approvalFlow.js';
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import os from "os";
import ConversationManager from "./chat.js";
import ConversationMemory from "./conversationmemory.js";
import { fileURLToPath } from "url";
import { setupTTSRoutes, ttsClient, setTtsApiKey } from "./tts.js";
import * as llmProvider from "./providers/llmProvider.js";
import { setupModelRoutes } from "./modelAPI.js";
import ContentManager from "./contentManager.js";
import { setupContentRoutes } from "./contentAPI.js";
import { setupVerificationRoutes } from "./verificationAPI.js";


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3010);
let quotesArray = [];
// const conversationHistory = [];

app.use(
  cors({
    origin: ["http://localhost:5173", "https://chatlab.3dvar.com"],
    credentials: true,
  }),
);
app.use(bodyParser.json({ limit: "50mb" }));
app.use("/audio", express.static("audio"));

// Use the TTS client from the tts.js module instead of creating a new one
const client = ttsClient;

const ensureDirectoryExistence = (filePath) => {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) return true;
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
};


app.post("/save-quotes", (req, res) => {
  const quotes = req.body; // Assuming quotes is an array
  if (Array.isArray(quotes)) {
    quotesArray.push(...quotes); // Spread operator to add all items to the array
    console.log("Quotes saved:", quotesArray);
    res.status(200).send({ message: "Quotes saved successfully", quotesArray });
  } else {
    res
      .status(400)
      .send({ message: "Invalid data format, expected an array." });
  }
});

// Setup TTS routes from the tts.js module
setupTTSRoutes(app, port);

// Setup model management routes
setupModelRoutes(app);

// Setup content API routes
setupContentRoutes(app);

// Setup verification routes
setupVerificationRoutes(app);

let conversationManager, conversationMemory;

app.post("/api/start-conversation", async (req, res) => {
  try {
    const config = req.body;
    if (conversationManager?._streamActive) {
      return res.status(409).json({ error: 'A conversation is still running or waiting for approval.' });
    }
    console.log(`Starting conversation with maxTurns: ${config.maxTurns}, completeConversation: ${config.completeConversation}`);

    // Track if response has been ended
    let responseEnded = false;

    // Function to safely write to response
    const safeWrite = (data) => {
      if (!responseEnded && !res.writableEnded) {
        res.write(data);
      } else {
        console.warn("Attempted to write to an ended response");
      }
    };

    // Function to safely end response
    const safeEnd = () => {
      if (!responseEnded && !res.writableEnded) {
        responseEnded = true;
        res.end();
      } else {
        console.warn("Attempted to end an already ended response");
      }
    };

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    });

    if (!config.shouldLoadPreviousConversationManager) {
      conversationMemory = new ConversationMemory();
    }
    conversationManager = new ConversationManager(config.maxTurns || 6, conversationMemory);
    const activeManager = conversationManager;
    activeManager._streamActive = true;
    const streamController = new AbortController();
    res.once('close', () => {
      streamController.abort();
      activeManager._streamActive = false;
      if (!res.writableFinished) activeManager.conversationPaused = true;
    });
    // Attach per-request LLM options to the manager for downstream usage
    conversationManager.llmOptions = {
      provider: req.headers['x-llm-provider'] || undefined,
      apiKey: req.headers['x-llm-key'] || undefined
    };
    console.log(`ConversationManager created with ${config.maxTurns || 6} maxTurns with conversationMemory`, conversationMemory);

    conversationManager.onMessageGenerated = (message) => {
      console.log(`Message generated from ${message.sender}: ${message.message?.substring(0, 30)}...`);
      
      // If message has needsApproval flag, log it clearly for debugging
      if (message.needsApproval) {
        console.log(`APPROVAL REQUIRED: Message from ${message.sender} needs approval - isDerailing: ${message.isDerailing}`);
      }
      
      // If conversation is paused and this is not a system message or derailing message,
      // don't send the message to the client
      if ((conversationManager.isWaitingForApproval || conversationManager.conversationPaused) && 
          !message.isSystemMessage && !message.isDerailing) {
        console.log('Message generation skipped - conversation is paused');
        return;
      }
      
      safeWrite(JSON.stringify({ type: "message", message }) + "\n");
    };

    activeManager.onReviewResolved = (decision) => {
      safeWrite(JSON.stringify({ type: 'review_decision', ...decision }) + '\n');
    };
    conversationManager.onHumanInputRequired = (speaker) => {
      console.log(`Human input required from: ${speaker}`);
      safeWrite(JSON.stringify({ type: "human_input_required", speaker }) + "\n");
    };

    // Add a callback for when the conversation is complete
    conversationManager.onConversationComplete = () => {
      // Update the conversation memory when conversation is complete
      if (conversationManager && conversationMemory) {
        console.log("Conversation complete, updating conversation memory");
        conversationMemory.conversationHistory = [...conversationManager.conversation];
      }
      
      // Only send completion signal if conversation is not paused or waiting for approval
      if (!conversationManager.isWaitingForApproval && !conversationManager.conversationPaused) {
        console.log("Conversation complete, sending completion signal");
        safeWrite(JSON.stringify({ type: "completion", status: "done" }) + "\n");
      } else {
        console.log("Conversation complete but paused - holding completion signal");
      }
    };

    await runConversation(config, res, safeWrite, safeEnd);
    await continueAfterApprovals(activeManager, streamController.signal);

    // After runConversation is complete, if completeConversation was requested,
    // ensure we signal completion if it wasn't already signaled AND conversation isn't paused
    if (config.completeConversation && !conversationManager.isWaitingForApproval && !conversationManager.conversationPaused) {
      console.log("Conversation processing finished");
      safeWrite(JSON.stringify({ type: "completion", status: "finished" }) + "\n");
    }
    safeEnd();
  } catch (error) {
    console.error("Error running conversation:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error running conversation" });
    } else if (!res.writableEnded) {
      res.write(JSON.stringify({ type: "error", error: error.message }) + "\n");
      res.end();
    } else {
      console.error("Cannot send error response, connection already closed");
    }
  }
});

app.post("/api/human-input", (req, res) => {
  const { input, speaker } = req.body;
  if (conversationManager) {
    conversationManager.provideHumanInput(speaker, input);
    res.status(200).json({ message: "Input received" });
  } else {
    res.status(400).json({ error: "Conversation not initialized" });
  }
});

// Existing /api/conversation-replay endpoint modified for audio generation only
app.post("/api/generate-audio", async (req, res) => {
  const { text, voice } = req.body;

  try {
    const voiceSettings = {
      languageCode: "en-US",
      name: voice,
    };

    const [response] = await client.synthesizeSpeech({
      input: { text: text },
      voice: voiceSettings,
      audioConfig: { audioEncoding: "LINEAR16" },
    });

    const filePath = path.join(
      __dirname,
      "audio",
      `${voiceSettings.name}-${Date.now()}.wav`,
    );
    ensureDirectoryExistence(filePath);
    await fs.promises.writeFile(filePath, response.audioContent, "binary");

    // const rhubarbPath = determineRhubarbPath();
    // const jsonFilePath = filePath.replace(".wav", ".json");

    if (process.env.NODE_ENV === "development") {
      res.json({
        audioUrl: `http://localhost:${port}/audio/${encodeURIComponent(path.basename(filePath))}`,
      });
    } else {
      res.json({
        audioUrl: `https://chatlab.3dvar.com/server/audio/${encodeURIComponent(path.basename(filePath))}`,
      });
    }
  } catch (error) {
    console.error("Failed to generate audio:", error);
    res.status(500).json({ error: "Failed to generate audio" });
  }
});


// Update the runConversation function in your server.js file
async function runConversation(config) {
  console.log("running conversation with config:", config);

  // Create the conversation manager if it doesn't exist
  if (!conversationManager) {
    conversationManager = new ConversationManager(config.maxTurns || 6);
  }

  // Set conversation mode settings
  if (config.conversationMode) {
    console.log(`DEBUG - Setting conversation mode to: ${config.conversationMode}`);
    
    switch (config.conversationMode) {
      case 'human-control':
        conversationManager.requireImpromptuApproval = true;
        conversationManager.autoApproveImpromptu = false;
        conversationManager.derailingEnabled = true;
        console.log(`DEBUG - human-control mode: requireImpromptuApproval=${conversationManager.requireImpromptuApproval}, autoApproveImpromptu=${conversationManager.autoApproveImpromptu}, derailingEnabled=${conversationManager.derailingEnabled}`);
        break;
        
      case 'autonomous':
        conversationManager.requireImpromptuApproval = false;
        conversationManager.autoApproveImpromptu = true;
        conversationManager.derailingEnabled = true;
        console.log(`DEBUG - autonomous mode: requireImpromptuApproval=${conversationManager.requireImpromptuApproval}, autoApproveImpromptu=${conversationManager.autoApproveImpromptu}, derailingEnabled=${conversationManager.derailingEnabled}`);
        break;
        
      case 'reactive':
        conversationManager.requireImpromptuApproval = false;
        conversationManager.autoApproveImpromptu = false;
        conversationManager.derailingEnabled = false;
        conversationManager.derailMode = null;
        console.log(`DEBUG - reactive mode: requireImpromptuApproval=${conversationManager.requireImpromptuApproval}, autoApproveImpromptu=${conversationManager.autoApproveImpromptu}, derailingEnabled=${conversationManager.derailingEnabled}`);
        
        // Also disable any existing derailer settings for all agents
        if (conversationManager.agents) {
          Object.values(conversationManager.agents).forEach(agent => {
            agent.isDerailer = false;
            agent.derailThreshold = 0;
          });
        }
        break;
    }
  }

  // Add agents to the conversation
  config.agents.forEach((agent) => {
    conversationManager.addAgent(
      agent.name,
      agent.personality,
      agent.interactionPattern,
      agent.isHumanProxy,
      agent.customAttributes,
      agent.fillerWordsFrequency,
    );

    if (agent.isHumanProxy) {
      conversationManager.setAgentAsHumanProxy(agent.name);
    }
  });

  // Set the interaction pattern
  conversationManager.setInteractionPattern(config.interactionPattern || "neutral");

  // Add interruption rules
  if (config.interruptionRules && Array.isArray(config.interruptionRules)) {
    config.interruptionRules.forEach((rule) => {
      conversationManager.setInterruptionRule(
        rule.interrupter,
        rule.interrupted,
        rule.probability,
        rule.vibe,
      );
    });
  }

  // Add backchannel rules
  if (config.backChannelRules && Array.isArray(config.backChannelRules)) {
    config.backChannelRules.forEach((rule) => {
      conversationManager.setBackChannelRule(
        rule.fromPeople,
        rule.toPeople,
        rule.frequency,
        rule.vibe,
        rule.probability,
      );
    });
  }

  // Handle party mode configuration if present
  if (config.partyMode && config.partyCommands && Array.isArray(config.partyCommands)) {
    console.log("Setting up party mode with commands:", config.partyCommands);
    
    // Process each party command in sequence
    for (const cmd of config.partyCommands) {
      switch (cmd.command) {
        case 'createParty':
          // Create a party with the specified members and configuration
          conversationManager.createParty(
            cmd.partyName,
            cmd.members,
            cmd.config,
            cmd.config.partyDescription
          );
          console.log(`Created party "${cmd.partyName}" with ${cmd.members.length} members`);
          break;
          
        case 'enablePartyMode':
          // Enable party mode with the specified turn-taking mode
          conversationManager.enablePartyMode(cmd.turnMode);
          console.log(`Enabled party mode with turn mode: ${cmd.turnMode}`);
          break;
          
        case 'setPartyRepresentative':
          // Set a representative for a specific party
          if (cmd.partyName && cmd.representative) {
            conversationManager.setPartyRepresentative(cmd.partyName, cmd.representative);
            console.log(`Set representative "${cmd.representative}" for party "${cmd.partyName}"`);
          }
          break;
          
        case 'setPartySpeakingMode':
          // Set speaking mode for a specific party
          if (cmd.partyName && cmd.mode) {
            conversationManager.setPartySpeakingMode(cmd.partyName, cmd.mode, cmd.options);
            console.log(`Set speaking mode "${cmd.mode}" for party "${cmd.partyName}"`);
          }
          break;
          
        case 'setAsDerailer':
          // Set an agent as a derailer with specified configuration
          if (cmd.agentName && cmd.config) {
            const agent = conversationManager.getAgentByName(cmd.agentName);
            if (agent) {
              agent.setAsDerailer(cmd.config.enable, {
                mode: cmd.config.mode || "random",
                threshold: cmd.config.threshold || 0.5,
                minTurns: cmd.config.minTurns || 3,
                maxTurns: cmd.config.maxTurns || 6
              });
              console.log(`Set agent "${cmd.agentName}" as derailer with mode: ${cmd.config.mode}, threshold: ${cmd.config.threshold}`);
            } else {
              console.warn(`Agent "${cmd.agentName}" not found for setAsDerailer command`);
            }
          }
          break;
          
        default:
          console.warn(`Unknown party command: ${cmd.command}`);
      }
    }
  }

  // Handle derailer commands if present
  if (config.derailerCommands && Array.isArray(config.derailerCommands)) {
    console.log("Setting up derailer mode with commands:", config.derailerCommands);
    
    // Process each derailer command in sequence
    for (const cmd of config.derailerCommands) {
      switch (cmd.command) {
        case 'setAsDerailer':
          // Set an agent as a derailer with specified configuration
          if (cmd.agentName && cmd.config) {
            const agent = conversationManager.getAgentByName(cmd.agentName);
            if (agent) {
              agent.setAsDerailer(cmd.config.enable, {
                mode: cmd.config.mode || "random",
                threshold: cmd.config.threshold || 0.5,
                minTurns: cmd.config.minTurns || 3,
                maxTurns: cmd.config.maxTurns || 6
              });
              console.log(`Set agent "${cmd.agentName}" as derailer with mode: ${cmd.config.mode}, threshold: ${cmd.config.threshold}`);
            } else {
              console.warn(`Agent "${cmd.agentName}" not found for setAsDerailer command`);
            }
          }
          break;
          
        default:
          console.warn(`Unknown derailer command: ${cmd.command}`);
      }
    }
  }

  // Handle content commands if present
  if (config.contentCommands && Array.isArray(config.contentCommands)) {
    console.log("Setting up content with commands:", config.contentCommands);
    
    // Ensure the ContentManager is initialized
    if (!conversationManager.contentManager) {
      conversationManager.contentManager = new ContentManager();
    }
    
    // Process each content command in sequence
    for (const cmd of config.contentCommands) {
      switch (cmd.command) {
        case 'initializeContent':
          try {
            // Load the PDF content
            const contentId = await conversationManager.initializeContentMode(
              cmd.filename,
              cmd.owners || null,
              cmd.isParty || false,
              cmd.presenter || null,
              cmd.presenterIsParty || false
            );
            
            console.log(`Initialized content "${cmd.filename}" with ID: ${contentId}`);
            console.log(`Content ownership: ${cmd.owners ? (cmd.isParty ? 'Party-owned' : 'Agent-owned') : 'Public'}`);
            console.log(`Presenter: ${cmd.presenter ? `${cmd.presenter} (${cmd.presenterIsParty ? 'party' : 'agent'})` : 'None'}`);
            
          } catch (error) {
            console.error(`Error initializing content "${cmd.filename}":`, error);
          }
          break;
          
        case 'setContentAsPublic':
          if (cmd.contentId) {
            try {
              conversationManager.contentManager.setContentAsPublic(
                cmd.contentId,
                cmd.presenter || null,
                cmd.presenterIsParty || false
              );
              console.log(`Set content ${cmd.contentId} as public`);
            } catch (error) {
              console.error(`Error setting content ${cmd.contentId} as public:`, error);
            }
          }
          break;
          
        default:
          console.warn(`Unknown content command: ${cmd.command}`);
      }
    }
  }

  // Start the conversation
  await conversationManager.initiateConversation(config);
}

// Add new endpoint for generating scene descriptions
app.post('/api/generate-scene-description', async (req, res) => {
  try {
    const { sceneName, speakers, partyInfo } = req.body;
    
    if (!sceneName) {
      return res.status(400).json({ error: 'Missing scene name' });
    }

    // Extract speaker names if available
    const speakerNames = speakers && Array.isArray(speakers) 
      ? speakers.map(s => s.name).join(', ')
      : null;
    
    // Format party information for the prompt if available
    let partyContext = '';
    if (partyInfo) {
      if (partyInfo.parties && Array.isArray(partyInfo.parties) && partyInfo.parties.length > 0) {
        const partyDescriptions = partyInfo.parties.map(party => 
          `"${party.name}" party consists of ${party.members.join(', ')}`
        );
        partyContext += `\nThe participants are organized in parties: ${partyDescriptions.join('. ')}.`;
      }
      
      if (partyInfo.moderatorParty) {
        partyContext += `\nThe "${partyInfo.moderatorParty}" party acts as the moderator of the conversation.`;
      }
      
      if (partyInfo.turnMode) {
        partyContext += `\nParty turn-taking happens in "${partyInfo.turnMode}" mode.`;
      }
    }
    
    // Prepare prompt for LLM
    const prompt = `Generate a concise description for a conversation scene named "${sceneName}".
    ${speakerNames ? `The scene includes the following participants: ${speakerNames}.` : ''}${partyContext}
    
    The description should:
    1. Be one sentence long
    2. Capture the essence of what the scene might be about based on its name
    3. Be suitable as context for a natural conversation
    4. Not include phrases like "In this scene" or "This scene is about"
    ${partyContext ? '5. Consider the party dynamics mentioned above' : ''}
    
    Provide only the description text without any additional explanations or formatting.`;

    // Get response from LLM
    const description = await llmProvider.generateText(`${prompt}\n\n请始终使用简体中文撰写结果，保留参与者姓名及必要的专有名称，不要附加英文译文。`, { maxTokens: 120, temperature: 0.7 });
    
    console.log(`Generated scene description for "${sceneName}": ${description}`);

    res.json({ description: description.trim() });
  } catch (error) {
    console.error('Error generating scene description:', error);
    res.status(500).json({ error: 'Failed to generate scene description' });
  }
});

// Add new endpoint for generating conversation prompts
app.post('/api/generate-conversation-prompt', async (req, res) => {
  try {
    const { generalContext, sceneDescription, subTopic, speakers, interactionPattern } = req.body;
    
    if (!sceneDescription) {
      return res.status(400).json({ error: 'Missing scene description' });
    }

    // Extract speaker names if available
    const speakerNames = speakers && Array.isArray(speakers) 
      ? speakers.map(s => s.name).join(', ')
      : null;
    
    // Prepare prompt for LLM
    const prompt = `Create a situational context for a conversation using the following format:
    "${speakerNames || 'The participants'} is in a conversation where ${sceneDescription}. They are talking about ${subTopic || 'various topics related to the scene'}."

    General context provided by the author: ${generalContext || ''}
    Write in the language requested by the author. Otherwise, match the language of the general context and subtopic; use Chinese when these are in Chinese. The English example above is only a structural example, not a language requirement.

    The context should:
    1. Naturally incorporate all the provided speakers: ${speakerNames || 'Not specified'}
    2. Do not add any additional information about the topic, or participants
    3. Reference the interaction style (${interactionPattern || 'neutral'}) through the tone
    4. Be 1-2 sentences long and feel natural
    5. Not include phrases like "In this scene" or "This scene is about"

    Provide only the context text without any additional explanations or formatting.`;

    // Get response from LLM
    const conversationPrompt = await llmProvider.generateText(`${prompt}\n\n请始终使用简体中文撰写结果，保留参与者姓名及必要的专有名称，不要附加英文译文。`, { maxTokens: 250, temperature: 0.7 });
    
    console.log(`Generated conversation prompt: ${conversationPrompt}`);

    res.json({ prompt: conversationPrompt.trim() });
  } catch (error) {
    console.error('Error generating conversation prompt:', error);
    res.status(500).json({ error: 'Failed to generate conversation prompt' });
  }
});

// Add new endpoint for deleting audio files
app.post('/api/delete-audio-files', async (req, res) => {
  try {
    const { segments } = req.body;
    
    if (!segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'Invalid segments data' });
    }

    const deletedFiles = [];
    const errors = [];

    for (const segment of segments) {
      if (segment.audioUrl) {
        try {
          // Extract filename from URL
          const filename = decodeURIComponent(segment.audioUrl.split('/').pop());
          const filePath = path.join(__dirname, 'audio', filename);
          
          // Check if file exists before trying to delete
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedFiles.push(filename);
            console.log(`Deleted audio file: ${filename}`);
          } else {
            console.log(`File not found: ${filename}`);
          }
        } catch (error) {
          errors.push(`Error deleting ${segment.audioUrl}: ${error.message}`);
          console.error(`Error deleting file: ${error.message}`);
        }
      }
    }

    res.json({
      success: true,
      deletedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in delete-audio-files:', error);
    res.status(500).json({ error: 'Failed to delete audio files' });
  }
});

// Review decisions resume the existing /api/start-conversation stream.
app.post('/api/impromptu/approve', async (req, res) => {
  if (!conversationManager?.pendingImpromptuPhase || !conversationManager.isWaitingForApproval) {
    return res.status(409).json({ error: 'No intervention is waiting for approval.' });
  }
  if (conversationManager._regeneratingIntervention) return res.status(409).json({ error: 'Please wait for regeneration to finish.' });
  try {
    const { editedContent } = req.body;
    if (typeof editedContent === 'string' && editedContent.trim()) {
      Object.assign(conversationManager.pendingImpromptuPhase.response, {
        content: editedContent.trim(), message: editedContent.trim(),
      });
    }
    await conversationManager.handleImpromptuPhaseApproval(true);
    res.type('application/x-ndjson').send(JSON.stringify({ type: 'status', status: 'approved' }) + '\n');
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve intervention.' });
  }
});

app.post('/api/impromptu/reject', async (req, res) => {
  if (!conversationManager?.pendingImpromptuPhase || !conversationManager.isWaitingForApproval) {
    return res.status(409).json({ error: 'No intervention is waiting for approval.' });
  }
  if (conversationManager._regeneratingIntervention) return res.status(409).json({ error: 'Please wait for regeneration to finish.' });
  try {
    await conversationManager.handleImpromptuPhaseApproval(false);
    res.type('application/x-ndjson').send(JSON.stringify({ type: 'status', status: 'rejected' }) + '\n');
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject intervention.' });
  }
});

app.post('/api/conversation/mode', async (req, res) => {
  const mode = req.body.mode;
  
  console.log(`DEBUG - Changing conversation mode to: ${mode}`);
  
  if (!mode || !['human-control', 'autonomous', 'reactive'].includes(mode)) {
    return res.status(400).send({ error: "Invalid conversation mode" });
  }

  if(!conversationManager) {
    return res.send({ status: "success", mode });
  }

  try {
    // Update the conversation manager's mode settings
    switch (mode) {
      case 'human-control':
        conversationManager.requireImpromptuApproval = true;
        conversationManager.autoApproveImpromptu = false;
        conversationManager.derailingEnabled = true;
        break;
        
      case 'autonomous':
        conversationManager.requireImpromptuApproval = false;
        conversationManager.autoApproveImpromptu = true;
        conversationManager.derailingEnabled = true;
        break;
        
      case 'reactive':
        conversationManager.requireImpromptuApproval = false;
        conversationManager.autoApproveImpromptu = false;
        conversationManager.derailingEnabled = false;
        break;
    }
    
    console.log(`DEBUG - Updated conversation mode to ${mode}: requireImpromptuApproval=${conversationManager.requireImpromptuApproval}, autoApproveImpromptu=${conversationManager.autoApproveImpromptu}, derailingEnabled=${conversationManager.derailingEnabled}`);
    
    if (mode === 'reactive' && conversationManager.pendingImpromptuPhase) {
      await conversationManager.handleImpromptuPhaseApproval(false);
    }

    res.send({ status: "success", mode });
  } catch (error) {
    console.error(`Error changing conversation mode:`, error);
    res.status(500).send({ error: "Failed to change conversation mode" });
  }
});

// Add endpoint for modifying a message before approval
app.post('/api/impromptu/edit-message', async (req, res) => {
  try {
    if (!conversationManager) {
      return res.status(404).json({ error: 'No active conversation manager' });
    }

    const { messageContent } = req.body;
    
    console.log('Handling impromptu message edit:', messageContent.substring(0, 30) + '...');
    
    if (!conversationManager.pendingImpromptuPhase) {
      return res.status(404).json({ error: 'No pending impromptu phase to edit' });
    }

    // Update the message content in the pending impromptu phase
    if (conversationManager.pendingImpromptuPhase.response) {
      // Update both content and message fields to ensure compatibility
      conversationManager.pendingImpromptuPhase.response.content = messageContent;
      conversationManager.pendingImpromptuPhase.response.message = messageContent;
      
      // Also find and update the message in the conversation array if it exists
      if (conversationManager.conversation) {
        const pendingMsgIndex = conversationManager.conversation.findIndex(msg => 
          msg.needsApproval === true && msg.isDerailing === true
        );
        
        if (pendingMsgIndex !== -1) {
          conversationManager.conversation[pendingMsgIndex].content = messageContent;
          conversationManager.conversation[pendingMsgIndex].message = messageContent;
          console.log('Updated pending message in conversation array');
        }
      }
      
      console.log('Updated pending impromptu message content');
    } else {
      console.warn('No response object found in pendingImpromptuPhase');
    }

    res.status(200).json({ success: true, message: 'Message updated successfully' });
    
  } catch (error) {
    console.error('Error editing impromptu message:', error);
    res.status(500).json({ error: 'Failed to edit message', details: error.message });
  }
});

// Regeneration returns one complete JSON document and keeps review paused.
app.post('/api/impromptu/regenerate-with-mode', async (req, res) => {
  const manager = conversationManager;
  const pending = manager?.pendingImpromptuPhase;
  if (!pending || !manager.isWaitingForApproval) {
    return res.status(409).json({ error: 'No intervention is waiting for approval.' });
  }
  const mode = req.body.mode || pending.derailMode;
  if (!['drift', 'extend', 'question', 'emotional'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid intervention mode.' });
  }
  if (manager._regeneratingIntervention) {
    return res.status(409).json({ error: 'An intervention is already being regenerated.' });
  }
  const agent = manager.getAgentByName(pending.derailerAgent.name);
  if (!agent) return res.status(404).json({ error: 'Intervention participant was not found.' });
  manager._regeneratingIntervention = true;
  const originalMode = agent.derailMode;
  try {
    const index = manager.conversation.findIndex(message => message.needsApproval && message.isDerailing);
    const context = manager.conversation.slice(0, index < 0 ? undefined : index)
      .filter(message => !message.isSystemMessage && !message.needsApproval).at(-1);
    agent.setDerailMode(mode);
    const result = await agent.generateDerailResponse(context?.message || '', manager.topic, 'All', manager.llmOptions || {});
    if (!result?.fullResponse?.trim()) throw new Error('No candidate text was generated.');
    if (manager.pendingImpromptuPhase !== pending) {
      return res.status(409).json({ error: 'The intervention has already been resolved.' });
    }
    const message = {
      ...pending.response, message: result.fullResponse, content: result.fullResponse,
      derailMode: mode, regenerated: true, needsApproval: true, isApproved: false, isDerailing: true,
    };
    pending.response = message;
    pending.derailMode = mode;
    if (index >= 0) manager.conversation[index] = message;
    res.json({ type: 'regenerated_message', message, success: true, mode });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate intervention. Please try again.' });
  } finally {
    agent.setDerailMode(originalMode);
    manager._regeneratingIntervention = false;
  }
});

const httpServer = app.listen(port, () => {
  console.log(`example app listening at port:${httpServer.address().port}`);
});

// Initialize API keys from environment if provided
if (process.env.DEEPSEEK_API_KEY) {
  llmProvider.setDeepSeekApiKey(process.env.DEEPSEEK_API_KEY);
}
if (process.env.OPENAI_API_KEY && typeof llmProvider.setOpenAIApiKey === 'function') {
  llmProvider.setOpenAIApiKey(process.env.OPENAI_API_KEY);
}
if (process.env.GEMINI_API_KEY) {
  try {
    // Lazy import to avoid circular deps if any
    const { setGeminiApiKey } = await import('./providers/geminiAPI.js');
    setGeminiApiKey(process.env.GEMINI_API_KEY);
  } catch (e) {
    console.warn('Failed to initialize GEMINI_API_KEY from env:', e.message);
  }
}
if (process.env.TTS_API_KEY) {
  setTtsApiKey(process.env.TTS_API_KEY);
}

// Initialize provider from environment
if (process.env.LLM_PROVIDER && typeof llmProvider.setProvider === 'function') {
  try {
    llmProvider.setProvider(process.env.LLM_PROVIDER.toLowerCase());
  } catch (e) {
    console.warn('Invalid LLM_PROVIDER in env, using default:', e.message);
  }
}
