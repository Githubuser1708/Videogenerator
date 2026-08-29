import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, VideoGenerationReferenceType } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  Film, 
  Play, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Image as ImageIcon,
  Settings,
  Sparkles,
  Camera,
  Move,
  Sun,
  Activity,
  Heart
} from "lucide-react";

// --- Types ---

interface SceneData {
  scene: string;
  subject: string;
  action: string;
  emotion: string;
  cameraShotType: string;
  cameraMovement: string;
  lighting: string;
  motion: string;
  mood: string;
  veoPrompt: string;
}

interface ImageData {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

// --- Components ---

const Header = () => (
  <header className="flex items-center justify-between p-6 border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
        <Film className="text-white w-5 h-5" />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Cinematic AI</h1>
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Powered by Veo</p>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <button 
        onClick={() => (window as any).aistudio.openSelectKey()}
        className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-600"
        title="Settings"
      >
        <Settings size={20} />
      </button>
    </div>
  </header>
);

const StatCard = ({ icon: Icon, label, value }: { icon: any, label: string, value: string }) => (
  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} className="text-zinc-400" />
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{label}</span>
    </div>
    <p className="text-sm font-medium text-zinc-800">{value || "Pending..."}</p>
  </div>
);

export default function App() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [script, setScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      const selected = await (window as any).aistudio.hasSelectedApiKey();
      setHasKey(selected);
    };
    checkKey();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (images.length + files.length > 5) {
      setError("Maximum 5 images allowed.");
      return;
    }

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setImages(prev => [...prev, {
          base64,
          mimeType: file.type,
          previewUrl: URL.createObjectURL(file)
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const generateVideo = async () => {
    if (!script) {
      setError("Please provide a script or scene description.");
      return;
    }
    if (!hasKey) {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStatus("Analyzing script and images...");
    setVideoUrl(null);
    setSceneData(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // 1. Generate Structured Data using Gemini Pro
      const proResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: `Analyze the following script and reference images to create a structured cinematic scene description. 
              The goal is to produce an 8-second video.
              
              Script: ${script}
              
              Return a JSON object with the following fields:
              - scene: location and environment description
              - subject: who or what appears in the shot
              - action: specific movement or action happening
              - emotion: the emotional tone of the scene
              - cameraShotType: e.g., wide, close-up, tracking, etc.
              - cameraMovement: e.g., pan, zoom, follow, static
              - lighting: e.g., natural, soft, dramatic, cinematic
              - motion: e.g., smooth, fast, realistic
              - mood: e.g., romantic, emotional, energetic
              - veoPrompt: A highly detailed, cinematic prompt for a video generation model (Veo). 
                Include details about lighting, texture, and camera work. 
                Mention the reference images' roles (e.g., "based on the character in image 1").` },
              ...images.map(img => ({
                inlineData: {
                  data: img.base64,
                  mimeType: img.mimeType
                }
              }))
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scene: { type: Type.STRING },
              subject: { type: Type.STRING },
              action: { type: Type.STRING },
              emotion: { type: Type.STRING },
              cameraShotType: { type: Type.STRING },
              cameraMovement: { type: Type.STRING },
              lighting: { type: Type.STRING },
              motion: { type: Type.STRING },
              mood: { type: Type.STRING },
              veoPrompt: { type: Type.STRING }
            },
            required: ["scene", "subject", "action", "emotion", "cameraShotType", "cameraMovement", "lighting", "motion", "mood", "veoPrompt"]
          }
        }
      });

      const data = JSON.parse(proResponse.text || "{}") as SceneData;
      setSceneData(data);

      // 2. Generate Video using Veo
      setStatus("Generating cinematic video (this may take a few minutes)...");
      
      const veoAi = new GoogleGenAI({ apiKey: (process.env as any).API_KEY });
      
      // Veo supports up to 3 reference images
      const referenceImages = images.slice(0, 3).map(img => ({
        image: {
          imageBytes: img.base64,
          mimeType: img.mimeType
        },
        referenceType: VideoGenerationReferenceType.ASSET
      }));

      let operation = await veoAi.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: data.veoPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9',
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined
        }
      });

      // Polling
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await veoAi.operations.getVideosOperation({ operation });
        
        // Update status messages to keep user engaged
        const messages = [
          "Crafting the lighting...",
          "Simulating camera movement...",
          "Rendering textures...",
          "Finalizing cinematic motion...",
          "Polishing the 8-second clip..."
        ];
        setStatus(messages[Math.floor(Math.random() * messages.length)]);
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': (process.env as any).API_KEY,
          },
        });
        const blob = await videoResponse.blob();
        setVideoUrl(URL.createObjectURL(blob));
        setStatus("Generation complete!");
      } else {
        throw new Error("Failed to retrieve video link.");
      }

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        setError("API Key error. Please re-select your key.");
        setHasKey(false);
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900">
      <Header />

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-88px)]">
        
        {/* Left Pane: Input */}
        <div className="p-8 border-r border-zinc-100 overflow-y-auto space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <ImageIcon size={16} /> Reference Images
              </h2>
              <span className="text-xs text-zinc-400">{images.length}/5</span>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              {images.map((img, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={i} 
                  className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 group"
                >
                  <img src={img.previewUrl} alt={`Ref ${i}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <button 
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <AlertCircle size={14} className="rotate-45" />
                  </button>
                </motion.div>
              ))}
              {images.length < 5 && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-2 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-all"
                >
                  <Upload size={20} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
                </button>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              multiple 
              accept="image/*" 
              className="hidden" 
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <Sparkles size={16} /> Scene Script
            </h2>
            <textarea 
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Describe your scene... e.g., 'A lone wanderer walking through a neon-lit cyberpunk city in the rain, looking up at a massive hologram.'"
              className="w-full h-48 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all resize-none text-sm leading-relaxed"
            />
          </section>

          <button 
            onClick={generateVideo}
            disabled={isGenerating || !script}
            className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${
              isGenerating || !script 
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' 
                : 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                {status}
              </>
            ) : (
              <>
                <Play size={18} />
                Generate Cinematic Clip
              </>
            )}
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-sm"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </motion.div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 text-xs leading-relaxed">
            <p className="font-bold mb-1 uppercase tracking-wider">Note:</p>
            Video generation can take 2-5 minutes. Please ensure you have selected a paid Gemini API key from a Google Cloud project with billing enabled. 
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline ml-1">Learn more about billing.</a>
          </div>
        </div>

        {/* Right Pane: Output */}
        <div className="p-8 bg-zinc-50 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!videoUrl && !isGenerating && !sceneData ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="w-20 h-20 bg-zinc-200 rounded-full flex items-center justify-center text-zinc-400">
                  <Film size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Your Masterpiece Awaits</h3>
                  <p className="text-sm text-zinc-500 max-w-xs mx-auto">Upload images and write a script to generate a cinematic 8-second video clip.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="content"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                {/* Video Player */}
                <div className="aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl relative group">
                  {videoUrl ? (
                    <video 
                      src={videoUrl} 
                      controls 
                      autoPlay 
                      loop 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
                      <Loader2 className="animate-spin text-zinc-400" size={48} />
                      <p className="text-sm font-medium animate-pulse">{status}</p>
                    </div>
                  )}
                  {videoUrl && (
                    <div className="absolute top-4 left-4 bg-zinc-900/80 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 border border-white/10">
                      <CheckCircle2 size={12} className="text-green-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white">Generated Clip</span>
                    </div>
                  )}
                </div>

                {/* Structured Data */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Scene Intelligence</h2>
                    {sceneData && <Sparkles size={16} className="text-zinc-400" />}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <StatCard icon={Camera} label="Shot Type" value={sceneData?.cameraShotType || ""} />
                    <StatCard icon={Move} label="Movement" value={sceneData?.cameraMovement || ""} />
                    <StatCard icon={Sun} label="Lighting" value={sceneData?.lighting || ""} />
                    <StatCard icon={Activity} label="Motion" value={sceneData?.motion || ""} />
                    <StatCard icon={Heart} label="Mood" value={sceneData?.mood || ""} />
                    <StatCard icon={Sparkles} label="Emotion" value={sceneData?.emotion || ""} />
                  </div>

                  {sceneData && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 bg-white rounded-3xl border border-zinc-200 space-y-4"
                    >
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-2">Scene Description</h4>
                        <p className="text-sm text-zinc-800 leading-relaxed">{sceneData.scene}</p>
                      </div>
                      <div>
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-2">Subject & Action</h4>
                        <p className="text-sm text-zinc-800 leading-relaxed">
                          <span className="font-bold">{sceneData.subject}</span> {sceneData.action}
                        </p>
                      </div>
                      <div className="pt-4 border-t border-zinc-100">
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-2">🎬 Cinematic Prompt</h4>
                        <p className="text-xs text-zinc-500 italic leading-relaxed">"{sceneData.veoPrompt}"</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
