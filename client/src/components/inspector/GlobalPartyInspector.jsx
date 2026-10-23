import { authoringPartyDescription } from '../../libs/authoringChinese';
import { authoringPartyLabel } from '../../libs/authoringChinese';
import React, { useState, useEffect } from 'react';
import { X, Trash, Plus, HelpCircle, Save, Settings, Users, Box as BoxIcon } from 'lucide-react';
import useEditorStore, { getDefaultParties as getOriginalDefaultParties } from './store';
import { cleanupPartyConfigs } from '../avatarconfig/utils/partyHelpers';

// Change the component to accept global prop to indicate global mode
const getDefaultParties = () => getOriginalDefaultParties().map(party => ({ ...party, description: authoringPartyDescription(party.description) }));

const GlobalPartyInspector = ({ global = true }) => {
  // Initialize parties state with an empty array
  const [parties, setParties] = useState(getDefaultParties());
  const [isCreatingParty, setIsCreatingParty] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyDescription, setNewPartyDescription] = useState('');
  const [activeTab, setActiveTab] = useState('basic'); // Add state for active tab
  const [selectedParty, setSelectedParty] = useState('');
  
  // Track party assignments in the scene
  const [partyAssignments, setPartyAssignments] = useState({});
  
  const { scenes, activeSceneId, updatePartyForBox, closeInspector, selectedItem, setPartyConfigs, setGlobalPartySettings, partyConfigs } = useEditorStore();

  // Global party communication settings
  const [globalSettings, setGlobalSettings] = useState({
    partyTurnMode: 'free',
    moderatorParty: '',
    enableBackchannel: false
  });

  // Add state for speaking mode and representative settings
  const [speakingModeSettings, setSpeakingModeSettings] = useState({});
  const [representativeSettings, setRepresentativeSettings] = useState({});

  // Effect to sync with scene boxes and load scene-specific global settings
  useEffect(() => {
    if (!scenes || !activeSceneId) return;

    const currentScene = scenes.find(scene => scene.id === activeSceneId);
    if (!currentScene || !currentScene.boxes) return;

    // Load scene-specific global settings if they exist
    if (currentScene.globalPartySettings) {
      setGlobalSettings(currentScene.globalPartySettings);
    } else {
      // Reset to defaults if no scene-specific settings exist
      setGlobalSettings({
        partyTurnMode: 'free',
        moderatorParty: '',
        enableBackchannel: false
      });
    }

    // Build party assignments and load configs from boxes
    const assignments = {};
    const configs = {};
    const scenePartySettings = {}; // Track all party settings from this scene

    currentScene.boxes.forEach(box => {
      if (box.party) {
        if (!assignments[box.party]) {
          assignments[box.party] = [];
        }
        // Get avatar count in this box
        const avatarCount = box.elements?.filter(el => 
          el.elementType === 'avatar' && el.avatarData
        ).length || 0;
        
        assignments[box.party].push({
          boxId: box.id,
          avatarCount,
          elements: box.elements || []
        });

        // Load party config from box if it exists
        if (box.partyConfig) {
          // Store the most complete party config we find for each party
          if (!configs[box.party] || Object.keys(box.partyConfig).length > Object.keys(configs[box.party]).length) {
            configs[box.party] = box.partyConfig;
          }
          
          // Keep track of all scene-specific party settings
          scenePartySettings[box.party] = true;
        }
      }
    });

    setPartyAssignments(assignments);
    
    // Update party configs in store
    if (Object.keys(configs).length > 0) {
      setPartyConfigs(configs);
    }

    // Also load any saved party templates that aren't already in the scene
    try {
      const savedParties = JSON.parse(localStorage.getItem('savedParties') || '[]');
      
      // Only add saved parties that aren't already in the scene
      const combinedParties = [...savedParties];
      
      // Update existing saved parties with scene-specific settings
      Object.keys(scenePartySettings).forEach(partyName => {
        const partyConfig = configs[partyName];
        if (!partyConfig) return;
        
        // Helper for getting description - needed before the function is defined
        const getDescription = (name) => {
          return partyConfigs[name]?.description || 
                 savedParties.find(p => p.name === name)?.description ||
                 getDefaultParties().find(p => p.name === name)?.description || 
                 `请补充“${name}”在对话中的职责和交流方式。`;
        };
        
        const existingPartyIndex = combinedParties.findIndex(p => p.name === partyName);
        if (existingPartyIndex !== -1) {
          // Update existing entry with scene-specific settings
          combinedParties[existingPartyIndex] = {
            ...combinedParties[existingPartyIndex],
            name: partyName,
            description: partyConfig.description || getDescription(partyName),
            speakingMode: partyConfig.speakingMode || 'random',
            hasRepresentative: partyConfig.hasRepresentative || false,
            enableBackchannel: partyConfig.enableBackchannel || false,
            representativeSpeaker: partyConfig.representativeSpeaker || '',
            subsetSize: partyConfig.speakingMode === 'subset' ? (partyConfig.subsetSize || 2) : undefined
          };
        } else {
          // Add new entry from scene
          combinedParties.push({
            name: partyName,
            description: partyConfig.description || getDescription(partyName),
            speakingMode: partyConfig.speakingMode || 'random',
            hasRepresentative: partyConfig.hasRepresentative || false,
            enableBackchannel: partyConfig.enableBackchannel || false,
            representativeSpeaker: partyConfig.representativeSpeaker || '',
            participantIds: partyConfig.participantIds || [],
            subsetSize: partyConfig.speakingMode === 'subset' ? (partyConfig.subsetSize || 2) : undefined
          });
        }
      });
      
      setParties(combinedParties);
    } catch (error) {
      console.error('Error loading saved parties:', error);
    }
  }, [scenes, activeSceneId]);

  // Effect to sync with EditorStore
  useEffect(() => {
    // Load party configs from EditorStore
    const configs = {};
    parties.forEach(party => {
      configs[party.name] = {
        name: party.name,
        description: party.description,
        speakingMode: party.speakingMode,
        hasRepresentative: party.hasRepresentative,
        enableBackchannel: party.enableBackchannel,
        representativeSpeaker: party.representativeSpeaker,
        participantIds: party.participantIds || []
      };
    });
    setPartyConfigs(configs);
    
    // Load global settings
    setGlobalPartySettings({
      partyTurnMode: globalSettings.partyTurnMode,
      moderatorParty: globalSettings.moderatorParty,
      enableBackchannel: globalSettings.enableBackchannel
    });
  }, [parties, globalSettings]);

  // Effect to load saved parties from localStorage
  useEffect(() => {
    try {
      const savedParties = localStorage.getItem('savedParties');
      
      if (savedParties) {
        try {
          const parsedParties = JSON.parse(savedParties);
          setParties(parsedParties);
        } catch (error) {
          console.error('Error parsing saved parties:', error);
          setParties(getDefaultParties());
        }
      } else {
        setParties(getDefaultParties());
      }

      // Load global settings if available
      const savedGlobalSettings = localStorage.getItem('globalPartySettings');
      if (savedGlobalSettings) {
        try {
          const parsedSettings = JSON.parse(savedGlobalSettings);
          setGlobalSettings(parsedSettings);
          // Also update EditorStore
          setGlobalPartySettings(parsedSettings);
        } catch (error) {
          console.error('Error parsing global party settings:', error);
        }
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      setParties(getDefaultParties());
    }
  }, []);

  // Effect to sync speaking mode and representative settings from party configs
  useEffect(() => {
    const updatedSpeakingMode = {};
    const updatedRepresentative = {};
    
    // First check if we have boxes with party configurations in the current scene
    if (scenes && activeSceneId) {
      const currentScene = scenes.find(scene => scene.id === activeSceneId);
      if (currentScene && currentScene.boxes) {
        // Group boxes by party
        const boxesByParty = {};
        currentScene.boxes.forEach(box => {
          if (box.party && box.partyConfig) {
            if (!boxesByParty[box.party]) {
              boxesByParty[box.party] = [];
            }
            boxesByParty[box.party].push(box);
          }
        });
        
        // Initialize settings from boxes first
        Object.entries(boxesByParty).forEach(([partyName, partyBoxes]) => {
          // Use the first box that has a partyConfig with the required settings
          const boxWithSettings = partyBoxes.find(box => 
            box.partyConfig && 
            (box.partyConfig.speakingMode || box.partyConfig.representativeSpeaker || box.partyConfig.subsetSize)
          );
          
          if (boxWithSettings) {
            const config = boxWithSettings.partyConfig;
            
            // Initialize speaking mode settings
            updatedSpeakingMode[partyName] = {
              mode: config.speakingMode || 'random',
              subsetSize: config.speakingMode === 'subset' ? (config.subsetSize || 2) : 2
            };
            
            // Initialize representative settings
            updatedRepresentative[partyName] = {
              hasRepresentative: config.speakingMode === 'representative',
              representativeSpeaker: config.representativeSpeaker || ''
            };
          }
        });
      }
    }
    
    // Then process party assignments to fill in any gaps
    Object.entries(partyAssignments).forEach(([partyName, boxes]) => {
      // If we already set this party's settings from scene boxes, skip
      if (updatedSpeakingMode[partyName] && updatedRepresentative[partyName]) {
        return;
      }
      
      // Get party config and saved party data
      const partyConfig = partyConfigs[partyName] || {};
      const savedParty = parties.find(p => p.name === partyName);
      
      // Set speaking mode and subset size if not already set
      if (!updatedSpeakingMode[partyName]) {
        updatedSpeakingMode[partyName] = {
          mode: partyConfig.speakingMode || savedParty?.speakingMode || 'random',
          subsetSize: partyConfig.subsetSize || savedParty?.subsetSize || 2
        };
      }
      
      // Set representative settings if not already set
      if (!updatedRepresentative[partyName]) {
        updatedRepresentative[partyName] = {
          hasRepresentative: partyConfig.speakingMode === 'representative' || savedParty?.speakingMode === 'representative',
          representativeSpeaker: partyConfig.representativeSpeaker || savedParty?.representativeSpeaker || ''
        };
      }
    });
    
    setSpeakingModeSettings(updatedSpeakingMode);
    setRepresentativeSettings(updatedRepresentative);
  }, [scenes, activeSceneId, partyAssignments, partyConfigs, parties]);

  const getPartyDescription = (partyName) => {
    return partyConfigs[partyName]?.description || 
           parties.find(p => p.name === partyName)?.description ||
           getDefaultParties().find(p => p.name === partyName)?.description || 
           `请补充“${partyName}”在对话中的职责和交流方式。`;
  };

  const handleUpdatePartyConfig = (partyName, field, value) => {
    setPartyConfigs(prev => {
      const updated = { ...prev };
      if (!updated[partyName]) {
        // When creating a new config, initialize with proper description
        const description = getPartyDescription(partyName);
        updated[partyName] = { 
          name: partyName,
          description
        };
      }
      updated[partyName][field] = value;
      return updated;
    });
  };

  // Update handleGlobalSettingChange to update scene's global settings
  const handleGlobalSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    if (!scenes || !activeSceneId) return;
    
    const updatedScenes = [...scenes];
    const sceneIndex = updatedScenes.findIndex(scene => scene.id === activeSceneId);
    if (sceneIndex === -1) return;

    const scene = updatedScenes[sceneIndex];
    
    // Update scene's global party settings
    if (!scene.globalPartySettings) {
      scene.globalPartySettings = {
        partyTurnMode: 'free',
        moderatorParty: '',
        enableBackchannel: false
      };
    }
    
    scene.globalPartySettings[name] = newValue;
    scene.hasUnsavedChanges = true;

    // Update local state
    setGlobalSettings(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Update boxes with the new settings
    let hasChanges = false;
    scene.boxes.forEach(box => {
      if (box.party) {
        // Get existing description for this party
        const existingDescription = getPartyDescription(box.party);
                                   
        if (!box.partyConfig) {
          box.partyConfig = {
            name: box.party,
            description: existingDescription,
            speakingMode: 'random',
            hasRepresentative: false,
            enableBackchannel: false,
            participantIds: []
          };
        }

        // Update the specific setting
        if (name === 'partyTurnMode') {
          box.partyConfig.partyTurnMode = newValue;
          hasChanges = true;
        } else if (name === 'enableBackchannel') {
          box.partyConfig.enableBackchannel = newValue;
          hasChanges = true;
        } else if (name === 'moderatorParty') {
          box.partyConfig.isModeratorParty = box.party === newValue;
          hasChanges = true;
        }
      }
    });

    // Update localStorage with the new scene data
    try {
      const storageKey = `scene:${scene.id}`;
      const existingSceneData = localStorage.getItem(storageKey);
      if (existingSceneData) {
        const sceneData = JSON.parse(existingSceneData);
        sceneData.globalPartySettings = scene.globalPartySettings;
        localStorage.setItem(storageKey, JSON.stringify(sceneData));
      }
      
      // Also save to globalPartySettings in localStorage
      const globalPartySettings = {
        partyTurnMode: scene.globalPartySettings.partyTurnMode,
        moderatorParty: scene.globalPartySettings.moderatorParty,
        enableBackchannel: scene.globalPartySettings.enableBackchannel
      };
      localStorage.setItem('globalPartySettings', JSON.stringify(globalPartySettings));
    } catch (error) {
      console.error('Error updating scene in localStorage:', error);
    }

    if (hasChanges) {
      window.editorStore.getState().setScenes(updatedScenes);
    }
  };

  // Update handleSpeakingModeChange to update scene boxes
  const handleSpeakingModeChange = (partyName, mode) => {
    if (!scenes || !activeSceneId) return;
    
    const updatedScenes = [...scenes];
    const sceneIndex = updatedScenes.findIndex(scene => scene.id === activeSceneId);
    if (sceneIndex === -1) return;

    const scene = updatedScenes[sceneIndex];
    let hasChanges = false;

    // Get the existing description from either partyConfigs, saved parties, default parties, or create default
    const existingDescription = getPartyDescription(partyName);

    scene.boxes.forEach(box => {
      if (box.party === partyName) {
        if (!box.partyConfig) {
          box.partyConfig = {
            name: partyName,
            description: existingDescription,
            speakingMode: mode,
            hasRepresentative: mode === 'representative',
            enableBackchannel: false,
            participantIds: []
          };
        } else {
          // Preserve existing description
          box.partyConfig.speakingMode = mode;
          box.partyConfig.hasRepresentative = mode === 'representative';
          if (mode !== 'representative') {
            box.partyConfig.representativeSpeaker = undefined;
          }
          if (mode !== 'subset') {
            box.partyConfig.subsetSize = undefined;
          }
        }
        hasChanges = true;
      }
    });

    if (hasChanges) {
      scene.hasUnsavedChanges = true;
      window.editorStore.getState().setScenes(updatedScenes);
    }

    // Update UI state
    setSpeakingModeSettings(prev => ({
      ...prev,
      [partyName]: {
        mode,
        subsetSize: mode === 'subset' ? (prev[partyName]?.subsetSize || 2) : null
      }
    }));
    
    // Update the savedParties in localStorage
    try {
      const savedParties = JSON.parse(localStorage.getItem('savedParties') || '[]');
      const partyIndex = savedParties.findIndex(p => p.name === partyName);
      
      if (partyIndex !== -1) {
        savedParties[partyIndex].speakingMode = mode;
        savedParties[partyIndex].hasRepresentative = mode === 'representative';
        
        if (mode !== 'representative') {
          savedParties[partyIndex].representativeSpeaker = '';
        }
        
        if (mode !== 'subset') {
          savedParties[partyIndex].subsetSize = undefined;
        }
        
        localStorage.setItem('savedParties', JSON.stringify(savedParties));
        setParties(savedParties);
      }
    } catch (error) {
      console.error('Error updating savedParties in localStorage:', error);
    }
  };

  // Update handleSubsetSizeChange to update scene boxes
  const handleSubsetSizeChange = (partyName, size) => {
    const parsedSize = parseInt(size) || 2;
    
    if (!scenes || !activeSceneId) return;
    
    const updatedScenes = [...scenes];
    const sceneIndex = updatedScenes.findIndex(scene => scene.id === activeSceneId);
    if (sceneIndex === -1) return;

    const scene = updatedScenes[sceneIndex];
    let hasChanges = false;

    // Get the existing description from either partyConfigs, saved parties, default parties, or create default
    const existingDescription = getPartyDescription(partyName);

    scene.boxes.forEach(box => {
      if (box.party === partyName) {
        if (!box.partyConfig) {
          box.partyConfig = {
            name: partyName,
            description: existingDescription,
            speakingMode: 'subset',
            hasRepresentative: false,
            enableBackchannel: false,
            participantIds: [],
            subsetSize: parsedSize
          };
        } else {
          box.partyConfig.speakingMode = 'subset';
          box.partyConfig.subsetSize = parsedSize;
        }
        hasChanges = true;
      }
    });

    if (hasChanges) {
      scene.hasUnsavedChanges = true;
      window.editorStore.getState().setScenes(updatedScenes);
    }

    // Update UI state
    setSpeakingModeSettings(prev => ({
      ...prev,
      [partyName]: {
        mode: 'subset',
        subsetSize: parsedSize
      }
    }));
    
    // Update the savedParties in localStorage
    try {
      const savedParties = JSON.parse(localStorage.getItem('savedParties') || '[]');
      const partyIndex = savedParties.findIndex(p => p.name === partyName);
      
      if (partyIndex !== -1) {
        savedParties[partyIndex].speakingMode = 'subset';
        savedParties[partyIndex].subsetSize = parsedSize;
        
        localStorage.setItem('savedParties', JSON.stringify(savedParties));
        setParties(savedParties);
      }
    } catch (error) {
      console.error('Error updating savedParties in localStorage:', error);
    }
  };

  // Update handleRepresentativeChange to update scene boxes
  const handleRepresentativeChange = (partyName, speakerId) => {
    if (!scenes || !activeSceneId) return;
    
    const updatedScenes = [...scenes];
    const sceneIndex = updatedScenes.findIndex(scene => scene.id === activeSceneId);
    if (sceneIndex === -1) return;

    const scene = updatedScenes[sceneIndex];
    let hasChanges = false;

    // Get the existing description from either partyConfigs, saved parties, default parties, or create default
    const existingDescription = getPartyDescription(partyName);

    scene.boxes.forEach(box => {
      if (box.party === partyName) {
        if (!box.partyConfig) {
          box.partyConfig = {
            name: partyName,
            description: existingDescription,
            speakingMode: 'representative',
            hasRepresentative: true,
            enableBackchannel: false,
            participantIds: [],
            representativeSpeaker: speakerId
          };
        } else {
          box.partyConfig.speakingMode = 'representative';
          box.partyConfig.hasRepresentative = true;
          box.partyConfig.representativeSpeaker = speakerId;
        }
        hasChanges = true;
      }
    });

    if (hasChanges) {
      scene.hasUnsavedChanges = true;
      window.editorStore.getState().setScenes(updatedScenes);
    }

    // Update UI state
    setRepresentativeSettings(prev => ({
      ...prev,
      [partyName]: {
        hasRepresentative: true,
        representativeSpeaker: speakerId
      }
    }));
    
    // Update the savedParties in localStorage
    try {
      const savedParties = JSON.parse(localStorage.getItem('savedParties') || '[]');
      const partyIndex = savedParties.findIndex(p => p.name === partyName);
      
      if (partyIndex !== -1) {
        savedParties[partyIndex].speakingMode = 'representative';
        savedParties[partyIndex].hasRepresentative = true;
        savedParties[partyIndex].representativeSpeaker = speakerId;
        
        localStorage.setItem('savedParties', JSON.stringify(savedParties));
        setParties(savedParties);
      }
    } catch (error) {
      console.error('Error updating savedParties in localStorage:', error);
    }
  };

  const handleCreateParty = () => {
    if (newPartyName.trim()) {
      const trimmedPartyName = newPartyName.trim();
      
      // Check if party already exists
      const existingParty = parties.find(p => p.name === trimmedPartyName);
      
      if (!existingParty) {
        // Create new party configuration
        const newParty = {
          name: trimmedPartyName,
          description: newPartyDescription.trim() || `请补充“${trimmedPartyName}”在对话中的职责和交流方式。`,
          speakingMode: 'random',
          hasRepresentative: false,
          enableBackchannel: globalSettings.enableBackchannel,
          participantIds: []
        };
        
        // Update parties state
        const updatedParties = [...parties, newParty];
        setParties(updatedParties);
        
        // Save to localStorage - savedParties
        localStorage.setItem('savedParties', JSON.stringify(updatedParties));

        // Update party configs in the store and localStorage
        const updatedPartyConfigs = {
          ...partyConfigs,
          [trimmedPartyName]: {
            name: trimmedPartyName,
            description: newParty.description,
            speakingMode: 'random',
            hasRepresentative: false,
            enableBackchannel: globalSettings.enableBackchannel,
            participantIds: []
          }
        };
        
        // Update store
        setPartyConfigs(updatedPartyConfigs);
        
        // Save to localStorage - partyConfigs
        localStorage.setItem('partyConfigs', JSON.stringify(updatedPartyConfigs));

        // If this is the first party, set it as moderator party if in moderated mode
        if (globalSettings.partyTurnMode === 'moderated' && !globalSettings.moderatorParty) {
          const updatedGlobalSettings = {
            ...globalSettings,
            moderatorParty: trimmedPartyName
          };
          setGlobalSettings(updatedGlobalSettings);
          localStorage.setItem('globalPartySettings', JSON.stringify(updatedGlobalSettings));
        }

        // Select the newly created party
        setSelectedParty(trimmedPartyName);

        // Trigger storage event for other components to detect the change
        window.dispatchEvent(new Event('storage'));
      } else {
        // If party exists, just select it
        setSelectedParty(trimmedPartyName);
      }
      
      // Reset create party state
      setNewPartyName('');
      setNewPartyDescription('');
      setIsCreatingParty(false);
    }
  };

  const handleDeleteParty = (partyName) => {
    if (confirm(`确定删除群组“${partyName}”吗？这会取消所有容器与该群组的关联。`)) {
      // Remove party from savedParties
      const updatedParties = parties.filter(p => p.name !== partyName);
      setParties(updatedParties);
      localStorage.setItem('savedParties', JSON.stringify(updatedParties));
      
      // Remove party from any boxes in the current scene
      if (scenes && activeSceneId) {
        const updatedScenes = [...scenes];
        const sceneIndex = updatedScenes.findIndex(s => s.id === activeSceneId);
        
        if (sceneIndex >= 0) {
          const scene = updatedScenes[sceneIndex];
          scene.boxes.forEach(box => {
            if (box.party === partyName) {
              updatePartyForBox(box.id, null);
            }
          });
        }
      }
      
      // If this was the selected party, clear selection
      if (selectedParty === partyName) {
        setSelectedParty('');
      }
      
      // If this was the moderator party, clear that too
      if (globalSettings.moderatorParty === partyName) {
        setGlobalSettings(prev => ({
          ...prev,
          moderatorParty: ''
        }));
      }
    }
  };

  // Helper component for tooltip icons
  const TooltipIcon = ({ text }) => (
    <span className="inline-flex items-center ml-1 relative group">
      <HelpCircle size={12} className="theme-text-tertiary hover:theme-text-secondary cursor-help" />
      <span className="absolute left-full top-1/2 transform -translate-y-1/2 ml-1 w-48 theme-bg-tooltip theme-text-inverse text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-lg">
        {text}
      </span>
    </span>
  );

  return (
    <div className="p-0 overflow-y-auto max-h-[calc(100vh-6rem)] theme-bg-primary theme-text-primary">
      {/* Sticky header with party selection and assignments */}
      <div className="sticky top-0 theme-bg-secondary theme-border-b theme-border p-2 shadow-sm z-10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium theme-text-primary">全局群组管理</h2>
          {global && (
            <button
              onClick={closeInspector}
              className="p-1 rounded-full hover:theme-bg-tertiary theme-text-tertiary hover:theme-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Party assignments overview */}
        <div className="mb-3 p-2 theme-bg-secondary rounded-lg border theme-border">
          <div className="flex items-center mb-2">
            <Users className="w-4 h-4 mr-1.5 theme-text-accent" />
            <span className="text-xs font-medium theme-text-primary">当前群组分配</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(partyAssignments).length > 0 ? (
              Object.entries(partyAssignments).map(([partyName, boxes]) => (
                <div key={partyName} className="flex items-center justify-between text-xs theme-bg-secondary p-1.5 rounded border theme-border">
                  <div className="flex items-center">
                    <span className="text-blue-300 font-medium">{authoringPartyLabel(partyName)}</span>
                  </div>
                  <div className="flex items-center theme-text-primary">
                    <BoxIcon className="w-3.5 h-3.5 mr-1" />
                    <span>{boxes.length} box{boxes.length !== 1 ? 'es' : ''}</span>
                    <span className="mx-1">•</span>
                    <Users className="w-3.5 h-3.5 mr-1" />
                    <span>
                      {boxes.reduce((total, box) => total + box.avatarCount, 0)} 角色
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs theme-text-primary text-center py-1">
                当前场景尚未分配群组
              </div>
            )}
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="selectedParty" className="block text-xs font-medium theme-text-primary">
              选择要配置的群组
            </label>
            {!isCreatingParty ? (
              <button
                type="button"
                onClick={() => setIsCreatingParty(true)}
                className="p-1 theme-bg-accent theme-text-inverse rounded-md hover:theme-bg-accent-hover transition-colors"
                title="创建新群组"
              >
                <Plus className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center space-x-2">
            <select
              id="selectedParty"
              name="selectedParty"
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
              className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary"
            >
              <option value="">请选择群组</option>
              {parties.map(partyOption => (
                <option key={partyOption.name} value={partyOption.name}>
                  {authoringPartyLabel(partyOption.name)}
                </option>
              ))}
            </select>
            
            {selectedParty && (
              <button
                onClick={() => handleDeleteParty(selectedParty)}
                className="p-1.5 theme-bg-error theme-text-inverse rounded-md hover:theme-bg-error-hover transition-colors"
                title="删除群组"
              >
                <Trash size={14} />
              </button>
            )}
          </div>
          
          {isCreatingParty && (
            <div className="theme-bg-panel p-2 rounded-md border theme-border mt-2">
              <div className="space-y-2">
                <div className="flex space-x-2 items-center">
                  <input
                    type="text"
                    value={newPartyName}
                    onChange={(e) => setNewPartyName(e.target.value)}
                    placeholder="新群组名称"
                    className="flex-grow p-1 theme-bg-input border theme-border rounded-md text-xs theme-text-primary placeholder-text-tertiary"
                    autoFocus
                  />
                </div>
                
                <div className="space-y-1">
                  <label htmlFor="newPartyDescription" className="block text-xs font-medium theme-text-primary">
                    群组说明
                    <TooltipIcon text="说明这个群组在对话中的职责与目标" />
                  </label>
                  <textarea
                    id="newPartyDescription"
                    value={newPartyDescription}
                    onChange={(e) => setNewPartyDescription(e.target.value)}
                    placeholder="请输入群组说明…"
                    className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary resize-y min-h-[60px]"
                  />
                </div>

                <div className="flex space-x-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingParty(false);
                      setNewPartyName('');
                      setNewPartyDescription('');
                    }}
                    className="p-1 theme-bg-tertiary theme-text-tertiary rounded-md hover:theme-bg-hover transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateParty}
                    disabled={!newPartyName.trim()}
                    className="px-3 py-1 theme-bg-accent theme-text-inverse rounded-md disabled:theme-bg-tertiary disabled:theme-text-tertiary disabled:cursor-not-allowed transition-colors"
                  >
                    创建群组
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-2 pt-2 pb-0">
        {/* Main Tabbed Interface */}
        <div className="mb-2">
          <nav className="flex border-b theme-border">
            <button 
              type="button"
              className={`px-2 py-1 border-b-2 text-xs font-medium ${activeTab === 'basic' ? 'theme-border-accent theme-text-accent' : 'border-transparent theme-text-tertiary hover:theme-text-secondary hover:theme-border-tertiary'}`}
              onClick={() => setActiveTab('basic')}
            >
              基本配置
            </button>
            <button 
              type="button"
              className={`px-2 py-1 border-b-2 text-xs font-medium ${activeTab === 'communication' ? 'theme-border-accent theme-text-accent' : 'border-transparent theme-text-tertiary hover:theme-text-secondary hover:theme-border-tertiary'}`}
              onClick={() => setActiveTab('communication')}
            >
              群组交流
            </button>
          </nav>
          
          <div className="pt-2 space-y-2">
            {/* Basic Configuration Tab Content */}
            {activeTab === 'basic' && (
              <div className="theme-bg-secondary rounded-md border theme-border overflow-hidden">
                <div className="theme-bg-panel px-3 py-1.5 border-b theme-border">
                  <h3 className="text-xs font-medium theme-text-primary">组内发言方式</h3>
                </div>
                <div className="p-2 space-y-3">
                  {Object.entries(partyAssignments).map(([partyName, boxes]) => (
                    <div key={partyName} className="p-2 theme-bg-accent-secondary rounded border theme-border-accent">
                      <h4 className="text-xs font-medium theme-text-accent mb-2">{authoringPartyLabel(partyName)}</h4>
                      
                      {/* Add Party Description Input */}
                      <div className="space-y-1 mb-3">
                        <label htmlFor={`description-${partyName}`} className="block text-xs font-medium theme-text-primary">
                          群组说明
                          <TooltipIcon text="说明这个群组在对话中的职责与目标" />
                        </label>
                        <textarea
                          id={`description-${partyName}`}
                          value={getPartyDescription(partyName)}
                          onChange={(e) => {
                            // Update both partyConfigs and parties state
                            handleUpdatePartyConfig(partyName, 'description', e.target.value);
                            
                            // Update parties state
                            const updatedParties = parties.map(party => {
                              if (party.name === partyName) {
                                return {
                                  ...party,
                                  description: e.target.value
                                };
                              }
                              return party;
                            });
                            setParties(updatedParties);
                            
                            // Save to localStorage
                            localStorage.setItem('savedParties', JSON.stringify(updatedParties));
                          }}
                          className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary resize-y min-h-[60px]"
                          placeholder="请输入群组说明…"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label htmlFor={`speakingMode-${partyName}`} className="block text-xs font-medium theme-text-primary">
                            发言方式
                            <TooltipIcon text="设置群组内哪些成员可以发言" />
                          </label>
                          <select
                            id={`speakingMode-${partyName}`}
                            value={speakingModeSettings[partyName]?.mode || 'random'}
                            onChange={(e) => handleSpeakingModeChange(partyName, e.target.value)}
                            className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary"
                          >
                            <option value="random">随机选择</option>
                            <option value="all">全体成员</option>
                            <option value="representative">仅代表发言</option>
                            <option value="subset">部分成员</option>
                          </select>
                        </div>

                        {/* Representative Selection */}
                        {speakingModeSettings[partyName]?.mode === 'representative' && (
                          <div className="space-y-1 ml-4 p-2 theme-bg-accent-secondary rounded-md border theme-border-accent">
                            <label htmlFor={`representative-${partyName}`} className="block text-xs font-medium theme-text-primary">
                              群组代表
                              <TooltipIcon text="由这位角色代表整个群组发言" />
                            </label>
                            <select
                              id={`representative-${partyName}`}
                              value={representativeSettings[partyName]?.representativeSpeaker || ''}
                              onChange={(e) => handleRepresentativeChange(partyName, e.target.value)}
                              className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary"
                            >
                              <option value="">请选择群组代表</option>
                              {boxes.map(box => 
                                box.elements
                                  .filter(el => el.elementType === 'avatar' && el.avatarData)
                                  .map(avatar => (
                                    <option key={avatar.id} value={avatar.id}>
                                      {avatar.avatarData.name || "未命名角色"}
                                    </option>
                                  ))
                              )}
                            </select>
                          </div>
                        )}
                        
                        {/* Subset Size */}
                        {speakingModeSettings[partyName]?.mode === 'subset' && (
                          <div className="space-y-1 ml-4 p-2 theme-bg-accent-secondary rounded-md border theme-border-accent">
                            <label htmlFor={`subsetSize-${partyName}`} className="block text-xs font-medium theme-text-primary">
                              发言人数
                              <TooltipIcon text="每次选择多少位组内成员发言" />
                            </label>
                            <input
                              id={`subsetSize-${partyName}`}
                              type="number"
                              min="1"
                              max="10"
                              value={speakingModeSettings[partyName]?.subsetSize || 2}
                              onChange={(e) => handleSubsetSizeChange(partyName, e.target.value)}
                              className="w-24 p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary"
                            />
                          </div>
                        )}
                        
                        <div className="text-xs theme-text-primary mt-1">
                          {boxes.reduce((total, box) => total + box.avatarCount, 0)} 位组内角色
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Party Communication Tab Content */}
            {activeTab === 'communication' && (
              <div className="theme-bg-secondary rounded-md border theme-border overflow-hidden">
                <div className="theme-bg-panel px-3 py-1.5 border-b theme-border">
                  <h3 className="text-xs font-medium theme-text-primary">全局群组设置</h3>
                </div>
                <div className="p-3 space-y-4">
                  <div className="p-2 theme-bg-accent-secondary rounded border theme-border-accent">
                    <h4 className="text-xs font-medium theme-text-accent mb-2">发言顺序</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="partyTurnMode" className="block text-xs font-medium theme-text-primary">
                          轮次规则
                          <TooltipIcon text="设置发言顺序：自由讨论允许自主发言；轮流发言按顺序进行；主持模式由主持人安排。" />
                        </label>
                        <select
                          id="partyTurnMode"
                          name="partyTurnMode"
                          value={globalSettings.partyTurnMode}
                          onChange={handleGlobalSettingChange}
                          className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary"
                        >
                          <option value="free">自由讨论</option>
                          <option value="round-robin">轮流发言</option>
                          <option value="moderated">主持模式（举手申请）</option>
                          <option value="moderated:nohandraising">主持模式（无需举手）</option>
                        </select>
                      </div>

                      {/* Moderator Party Dropdown - Show for both moderated modes */}
                      {(globalSettings.partyTurnMode === 'moderated' || globalSettings.partyTurnMode === 'moderated:nohandraising') && (
                        <div className="space-y-1">
                          <label htmlFor="moderatorParty" className="block text-xs font-medium theme-text-primary">
                            主持群组
                            <TooltipIcon text={globalSettings.partyTurnMode === 'moderated' 
                              ? "由此群组审核举手申请并主持讨论"
                              : "由此群组主持讨论并安排发言顺序"} />
                          </label>
                          <select
                            id="moderatorParty"
                            name="moderatorParty"
                            value={globalSettings.moderatorParty}
                            onChange={handleGlobalSettingChange}
                            className="w-full p-1.5 theme-bg-input border theme-border rounded-md text-xs theme-text-primary"
                          >
                            <option value="">请选择主持群组</option>
                            {Object.keys(partyAssignments).map(partyName => (
                              <option key={partyName} value={partyName}>
                                {authoringPartyLabel(partyName)} ({partyAssignments[partyName].reduce((total, box) => total + box.avatarCount, 0)} 位角色）
                              </option>
                            ))}
                          </select>
                          {globalSettings.moderatorParty && (
                            <p className="text-xs theme-text-primary mt-1">
                              {partyAssignments[globalSettings.moderatorParty]?.reduce((total, box) => total + box.avatarCount, 0)} 位主持群组角色
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2 theme-bg-accent-light rounded border theme-border-accent">
                    <h4 className="text-xs font-medium theme-text-accent mb-2">非语言反馈</h4>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="enableBackchannel"
                        name="enableBackchannel"
                        checked={globalSettings.enableBackchannel}
                        onChange={handleGlobalSettingChange}
                        className="h-3 w-3 theme-text-accent theme-focus-ring theme-border rounded"
                      />
                      <label htmlFor="enableBackchannel" className="ml-2 block text-xs font-medium theme-text-primary">
                        为所有群组启用非语言反馈
                        <TooltipIcon text="允许组内成员进行不打断主对话的反馈互动" />
                      </label>
                    </div>
                    <p className="text-xs theme-text-primary ml-5 mt-1">
                      允许组内成员进行反馈互动
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Debug section - collapsed by default */}
      <div className="theme-bg-secondary theme-border-t theme-border p-2">
        <div className="flex items-center justify-between cursor-pointer" 
             onClick={() => document.getElementById('globalDebugSection').classList.toggle('hidden')}>
          <h3 className="text-xs font-medium theme-text-tertiary">高级选项</h3>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 theme-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        <div id="globalDebugSection" className="hidden mt-1 space-y-1">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => {
                if (confirm("确定清除所有已保存的群组配置吗？")) {
                  localStorage.removeItem('partyConfigs');
                  localStorage.removeItem('globalPartySettings');
                  setPartyConfigs({});
                  setGlobalSettings({
                    partyTurnMode: 'free',
                    moderatorParty: '',
                    enableBackchannel: false
                  });
                  alert("已清除全部群组配置。");
                }
              }}
              className="text-xs px-2 py-1 theme-bg-error-light theme-text-error rounded hover:theme-bg-error-light transition-colors"
            >
              清除全部群组配置
            </button>
            
            <button
              onClick={() => {
                try {
                  const configsStr = localStorage.getItem('partyConfigs');
                  const configs = configsStr ? JSON.parse(configsStr) : {};
                  console.log('Party Configs:', configs);
                  
                  const globalStr = localStorage.getItem('globalPartySettings');
                  const global = globalStr ? JSON.parse(globalStr) : {};
                  console.log('Global Party Settings:', global);
                  
                  const savedPartiesStr = localStorage.getItem('savedParties');
                  const savedParties = savedPartiesStr ? JSON.parse(savedPartiesStr) : [];
                  console.log('Saved Parties:', savedParties);
                  
                  alert("群组调试信息已输出到控制台。");
                } catch (error) {
                  console.error('Error reading party data:', error);
                  alert("读取群组数据失败，详情见控制台。");
                }
              }}
              className="text-xs px-2 py-1 theme-bg-accent-light theme-text-accent rounded hover:theme-bg-accent-light transition-colors"
            >
              查看群组调试信息
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalPartyInspector; 