/**
 * Unified feature support metrics for LLM models.
 * Keep in sync with `src-tauri/src/models/model_capabilities.rs`.
 */

import {
  AUDIO_FILE_TYPES,
  DOCUMENT_FILE_TYPES,
  IMAGE_FILE_TYPES,
  VIDEO_FILE_TYPES,
} from '@/lib/constants';
import {
  getEffectiveFileMime,
  getTextExtractableAcceptList,
  isTextExtractableFile,
  isTextLikeMime,
} from '@/lib/text-file';
import type { LLMModel } from '../types';

export interface ModelInputCapabilities {
  image: boolean;
  document: boolean;
  audio: boolean;
  video: boolean;
}

export interface ModelCapabilities {
  input: ModelInputCapabilities;
  tools: boolean;
  thinking: boolean;
  imageGeneration: boolean;
  textExtraction: boolean;
}

const EMPTY_INPUT: ModelInputCapabilities = {
  image: false,
  document: false,
  audio: false,
  video: false,
};

const EMPTY_CAPABILITIES: ModelCapabilities = {
  input: EMPTY_INPUT,
  tools: false,
  thinking: false,
  imageGeneration: false,
  textExtraction: false,
};

export function normalizeModelId(modelId: string): string {
  const segments = modelId.split('/');
  const clean = segments[segments.length - 1] ?? modelId;
  return clean.replace(/^models\//, '').toLowerCase();
}

function isImageGenerationModelNormalized(modelLower: string): boolean {
  return (
    modelLower.includes('dall-e') ||
    modelLower.includes('dall_e') ||
    modelLower.includes('gpt-image') ||
    modelLower.includes('imagen') ||
    modelLower.includes('banana') ||
    modelLower.includes('flux.2') ||
    modelLower.includes('flux-2') ||
    modelLower.includes('flux/') ||
    modelLower.includes('riverflow') ||
    (modelLower.includes('image') &&
      (modelLower.includes('gemini') ||
        modelLower.startsWith('gpt-5') ||
        modelLower.includes('nano')))
  );
}

function supportsImageInputForImageModel(modelLower: string): boolean {
  return (
    modelLower.includes('gemini') ||
    modelLower.includes('gpt-image') ||
    modelLower.includes('banana') ||
    modelLower.includes('flux')
  );
}

function isNonChatModel(modelLower: string): boolean {
  return (
    modelLower.includes('embedding') ||
    modelLower.includes('whisper') ||
    modelLower.includes('transcribe') ||
    modelLower.endsWith('-tts') ||
    modelLower.includes('tts-') ||
    modelLower.includes('moderation') ||
    modelLower.includes('veo-') ||
    modelLower.includes('lyria')
  );
}

function isImageOnlyVlm(modelLower: string): boolean {
  return (
    modelLower.includes('llava') ||
    modelLower.includes('bakllava') ||
    modelLower.includes('minicpm-v') ||
    modelLower.includes('moondream') ||
    modelLower.includes('internvl') ||
    modelLower.includes('firellava') ||
    modelLower.includes('pixtral') ||
    (modelLower.includes('qwen') && modelLower.includes('-vl')) ||
    (modelLower.includes('vision') && !modelLower.includes('gpt-4.1'))
  );
}

function supportsImageInput(modelLower: string): boolean {
  if (isNonChatModel(modelLower)) return false;

  if (modelLower.startsWith('gpt-4o') || modelLower.startsWith('gpt-4-turbo')) {
    return true;
  }
  if (
    modelLower.startsWith('gpt-4') &&
    (modelLower.includes('vision') ||
      modelLower.includes('0125-preview') ||
      modelLower.includes('1106-preview') ||
      modelLower.includes('2024-04-09') ||
      modelLower.includes('2024-08-06') ||
      modelLower.includes('2024-11-20'))
  ) {
    return true;
  }
  if (
    modelLower.startsWith('gpt-5') ||
    modelLower.startsWith('o1') ||
    modelLower.startsWith('o3') ||
    modelLower.startsWith('o4-mini')
  ) {
    return true;
  }

  if (
    modelLower.includes('claude-3') ||
    modelLower.includes('claude-opus') ||
    modelLower.includes('claude-sonnet') ||
    modelLower.includes('claude-haiku') ||
    modelLower.includes('claude-fable') ||
    modelLower.includes('claude-mythos')
  ) {
    return true;
  }

  if (modelLower.startsWith('gemini')) return true;

  if (
    isImageOnlyVlm(modelLower) ||
    modelLower.includes('llama-3.2-vision') ||
    modelLower.includes('llama3.2-vision') ||
    modelLower.includes('llama-4-scout') ||
    modelLower.includes('llama-4-maverick') ||
    modelLower.includes('llama4-scout') ||
    modelLower.includes('llama4-maverick') ||
    modelLower.includes('qwen2.5-vl') ||
    modelLower.includes('qwen2-vl') ||
    modelLower.includes('qwen-vl') ||
    modelLower.includes('qwen3-vl') ||
    modelLower.includes('phi-3.5-vision') ||
    modelLower.includes('phi3.5-vision') ||
    modelLower.includes('gemma3')
  ) {
    return true;
  }

  return false;
}

function supportsDocumentInput(modelLower: string): boolean {
  if (
    isNonChatModel(modelLower) ||
    isImageGenerationModelNormalized(modelLower)
  ) {
    return false;
  }
  if (isImageOnlyVlm(modelLower)) return false;
  if (modelLower.includes('deepseek')) return false;

  if (
    modelLower.startsWith('gpt-3.5') ||
    modelLower.startsWith('gpt-4') ||
    modelLower.startsWith('gpt-5') ||
    modelLower.startsWith('o1') ||
    modelLower.startsWith('o3') ||
    modelLower.startsWith('o4-mini')
  ) {
    return true;
  }

  if (
    modelLower.includes('claude-3') ||
    modelLower.includes('claude-opus') ||
    modelLower.includes('claude-sonnet') ||
    modelLower.includes('claude-haiku') ||
    modelLower.includes('claude-fable') ||
    modelLower.includes('claude-mythos')
  ) {
    return true;
  }

  if (modelLower.startsWith('gemini')) return true;

  return false;
}

function supportsAudioInput(modelLower: string): boolean {
  if (
    isNonChatModel(modelLower) ||
    isImageGenerationModelNormalized(modelLower)
  ) {
    return false;
  }

  if (
    modelLower.startsWith('gemini-2.') ||
    modelLower.startsWith('gemini-3') ||
    modelLower.startsWith('gemini_2.') ||
    modelLower.startsWith('gemini_3')
  ) {
    return true;
  }

  return (
    modelLower.includes('gpt-4o-audio') ||
    modelLower.includes('gpt-4o-realtime')
  );
}

function supportsVideoInput(modelLower: string): boolean {
  if (
    isNonChatModel(modelLower) ||
    isImageGenerationModelNormalized(modelLower)
  ) {
    return false;
  }

  return (
    modelLower.startsWith('gemini-2.') ||
    modelLower.startsWith('gemini-3') ||
    modelLower.startsWith('gemini_2.') ||
    modelLower.startsWith('gemini_3')
  );
}

function detectInputCapabilities(modelLower: string): ModelInputCapabilities {
  if (isNonChatModel(modelLower)) return EMPTY_INPUT;

  return {
    image: supportsImageInput(modelLower),
    document: supportsDocumentInput(modelLower),
    audio: supportsAudioInput(modelLower),
    video: supportsVideoInput(modelLower),
  };
}

/** Detect capabilities from a model id (client-side fallback). */
export function detectModelCapabilities(
  modelId: string | undefined | null
): ModelCapabilities {
  if (!modelId) return EMPTY_CAPABILITIES;

  const modelLower = normalizeModelId(modelId);
  if (!modelLower) return EMPTY_CAPABILITIES;

  const imageGeneration = isImageGenerationModelNormalized(modelLower);
  if (imageGeneration) {
    return {
      input: {
        image: supportsImageInputForImageModel(modelLower),
        document: false,
        audio: false,
        video: false,
      },
      tools: false,
      thinking: false,
      imageGeneration: true,
      textExtraction: false,
    };
  }

  return {
    input: detectInputCapabilities(modelLower),
    tools: supportsTools(modelLower),
    thinking: supportsThinking(modelLower),
    imageGeneration: false,
    textExtraction: supportsTextExtraction(modelLower),
  };
}

function supportsTextExtraction(modelLower: string): boolean {
  if (
    isNonChatModel(modelLower) ||
    isImageGenerationModelNormalized(modelLower)
  ) {
    return false;
  }
  return !supportsDocumentInput(modelLower);
}

function supportsTools(modelLower: string): boolean {
  if (
    isNonChatModel(modelLower) ||
    isImageGenerationModelNormalized(modelLower)
  ) {
    return false;
  }
  if (modelLower.includes('moondream')) return false;
  if (modelLower === 'groq/compound' || modelLower === 'groq/compound-mini') {
    return false;
  }

  if (
    modelLower.startsWith('gpt-3.5') ||
    modelLower.startsWith('gpt-4') ||
    modelLower.startsWith('gpt-5') ||
    modelLower.startsWith('o1') ||
    modelLower.startsWith('o3') ||
    modelLower.startsWith('o4-mini')
  ) {
    return true;
  }

  if (
    modelLower.includes('claude-3') ||
    modelLower.includes('claude-opus') ||
    modelLower.includes('claude-sonnet') ||
    modelLower.includes('claude-haiku') ||
    modelLower.includes('claude-fable') ||
    modelLower.includes('claude-mythos')
  ) {
    return true;
  }

  if (modelLower.startsWith('gemini')) return true;

  if (modelLower.includes('deepseek') && !modelLower.includes('-vl')) {
    return true;
  }

  if (
    modelLower.includes('qwen') ||
    modelLower.includes('llama') ||
    modelLower.includes('mistral') ||
    modelLower.includes('mixtral') ||
    modelLower.includes('minimax') ||
    modelLower.startsWith('abab') ||
    modelLower.includes('glm') ||
    modelLower.includes('kimi') ||
    modelLower.includes('gpt-oss') ||
    modelLower.includes('gpt_oss') ||
    modelLower.includes('nemotron') ||
    modelLower.includes('firefunction')
  ) {
    return true;
  }

  return false;
}

function supportsThinking(modelLower: string): boolean {
  if (
    isNonChatModel(modelLower) ||
    isImageGenerationModelNormalized(modelLower)
  ) {
    return false;
  }

  if (
    modelLower.startsWith('o1') ||
    modelLower.startsWith('o3') ||
    modelLower.startsWith('o4-mini') ||
    modelLower.startsWith('gpt-5')
  ) {
    return true;
  }

  if (
    modelLower.includes('deepseek-v4') ||
    modelLower.includes('deepseek-r1') ||
    modelLower.includes('deepseek-reasoner')
  ) {
    return true;
  }

  if (
    modelLower.startsWith('gemini-2.5') ||
    modelLower.startsWith('gemini-3') ||
    modelLower.startsWith('gemini_2.5') ||
    modelLower.startsWith('gemini_3')
  ) {
    return true;
  }

  if (
    modelLower.includes('claude-3-5-sonnet') ||
    modelLower.includes('claude-3-7') ||
    modelLower.includes('claude-opus-4') ||
    modelLower.includes('claude-sonnet-4') ||
    modelLower.includes('claude-fable') ||
    modelLower.includes('claude-mythos')
  ) {
    return true;
  }

  if (modelLower.includes('gpt-oss') || modelLower.includes('gpt_oss')) {
    return true;
  }

  if (
    modelLower.includes('qwen3.5') ||
    modelLower.includes('qwen3-235b') ||
    (modelLower.includes('qwen3') && modelLower.includes('thinking'))
  ) {
    return true;
  }

  if (
    modelLower.includes('glm-4.7') ||
    modelLower.includes('glm-5') ||
    modelLower.includes('glm_4.7') ||
    modelLower.includes('glm_5')
  ) {
    return true;
  }

  if (modelLower.includes('kimi-k2') || modelLower.includes('kimi_k2')) {
    return true;
  }

  return false;
}

function resolveInputFromModel(
  model: LLMModel | undefined,
  detected: ModelInputCapabilities
): ModelInputCapabilities {
  const legacyVision = model?.supportsVision;

  return {
    image: model?.supportsImageInput ?? legacyVision ?? detected.image,
    document: model?.supportsDocumentInput ?? detected.document,
    audio: model?.supportsAudioInput ?? detected.audio,
    video: model?.supportsVideoInput ?? detected.video,
  };
}

/** Prefer backend-detected flags on the model; fall back to heuristics. */
export function resolveModelCapabilities(
  model: LLMModel | undefined,
  fallbackModelId?: string | null
): ModelCapabilities {
  const modelId = model?.id ?? fallbackModelId ?? '';
  const detected = detectModelCapabilities(modelId);

  return {
    input: resolveInputFromModel(model, detected.input),
    tools: model?.supportsTools ?? detected.tools,
    thinking: model?.supportsThinking ?? detected.thinking,
    imageGeneration: model?.supportsImageGeneration ?? detected.imageGeneration,
    textExtraction: model?.supportsTextExtraction ?? detected.textExtraction,
  };
}

export function supportsAnyFileInput(input: ModelInputCapabilities): boolean {
  return input.image || input.document || input.audio || input.video;
}

export function canAttachFiles(capabilities: ModelCapabilities): boolean {
  return (
    supportsAnyFileInput(capabilities.input) || capabilities.textExtraction
  );
}

export function getFileAcceptForCapabilities(
  capabilities: ModelCapabilities
): string {
  const { input, textExtraction } = capabilities;
  const parts: string[] = [];
  if (input.image) parts.push('image/*');
  if (input.document) {
    parts.push(...DOCUMENT_FILE_TYPES, 'text/*');
  } else if (textExtraction) {
    parts.push(getTextExtractableAcceptList(), 'application/pdf');
  }
  if (input.audio) parts.push(...AUDIO_FILE_TYPES);
  if (input.video) parts.push(...VIDEO_FILE_TYPES);
  return parts.join(',');
}

/** @deprecated Use getFileAcceptForCapabilities */
export function getFileAcceptForInput(input: ModelInputCapabilities): string {
  const parts: string[] = [];
  if (input.image) parts.push('image/*');
  if (input.document) parts.push(...DOCUMENT_FILE_TYPES);
  if (input.audio) parts.push(...AUDIO_FILE_TYPES);
  if (input.video) parts.push(...VIDEO_FILE_TYPES);
  return parts.join(',');
}

export function isFileAllowedForCapabilities(
  file: File,
  capabilities: ModelCapabilities
): boolean {
  const { input, textExtraction } = capabilities;
  const mime = getEffectiveFileMime(file);
  const isImage =
    mime.startsWith('image/') ||
    IMAGE_FILE_TYPES.includes(mime as (typeof IMAGE_FILE_TYPES)[number]);
  const isPdf = mime === 'application/pdf';
  const isTextExtractable = isTextExtractableFile(file);
  const isNativeDocument =
    isPdf ||
    isTextLikeMime(mime) ||
    DOCUMENT_FILE_TYPES.includes(mime as (typeof DOCUMENT_FILE_TYPES)[number]);
  const isAudio = AUDIO_FILE_TYPES.includes(
    mime as (typeof AUDIO_FILE_TYPES)[number]
  );
  const isVideo = VIDEO_FILE_TYPES.includes(
    mime as (typeof VIDEO_FILE_TYPES)[number]
  );

  if (isImage) return input.image;
  if (isNativeDocument || isTextExtractable) {
    if (input.document) return true;
    return textExtraction && (isPdf || isTextExtractable);
  }
  if (isAudio) return input.audio;
  if (isVideo) return input.video;

  return false;
}

/** @deprecated Use isFileAllowedForCapabilities */
export function isFileAllowedForInput(
  file: File,
  input: ModelInputCapabilities
): boolean {
  const type = file.type;
  const isImage =
    type.startsWith('image/') ||
    IMAGE_FILE_TYPES.includes(type as (typeof IMAGE_FILE_TYPES)[number]);
  const isDocument = DOCUMENT_FILE_TYPES.includes(
    type as (typeof DOCUMENT_FILE_TYPES)[number]
  );
  const isAudio = AUDIO_FILE_TYPES.includes(
    type as (typeof AUDIO_FILE_TYPES)[number]
  );
  const isVideo = VIDEO_FILE_TYPES.includes(
    type as (typeof VIDEO_FILE_TYPES)[number]
  );

  if (isImage) return input.image;
  if (isDocument) return input.document;
  if (isAudio) return input.audio;
  if (isVideo) return input.video;

  return false;
}

/** @deprecated Use `resolveModelCapabilities(model).input.image` */
export function isVisionModel(modelName: string | undefined | null): boolean {
  return detectModelCapabilities(modelName).input.image;
}
