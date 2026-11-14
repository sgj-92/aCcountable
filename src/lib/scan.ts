import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

export interface ScannedItem {
  name: string;
  portion: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface ScanResult {
  is_food: boolean;
  meal_name: string;
  items: ScannedItem[];
  notes: string;
  model: string;
}

/**
 * Downscale + JPEG-compress a photo before upload. ~1280px is plenty for food
 * recognition and keeps the request small (and the vision tokens cheap).
 */
export async function prepareImage(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri, { maxWidth: 1280, maxHeight: 1280 }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!out.base64) throw new Error('Could not read the photo');
  return out.base64;
}

export async function analyzeFoodPhoto(uri: string, note?: string): Promise<ScanResult> {
  const imageBase64 = await prepareImage(uri);
  const { data, error } = await supabase.functions.invoke<ScanResult>('analyze-food', {
    body: { imageBase64, mediaType: 'image/jpeg', note: note?.trim() || undefined },
  });
  if (error) {
    // Surface the function's own error message when it sent one.
    let message: string | undefined;
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') message = body.error;
      } catch {
        // Non-JSON error body; fall through to the generic message.
      }
    }
    throw new Error(message ?? (error.message || 'Photo analysis failed'));
  }
  if (!data) throw new Error('Photo analysis returned nothing');
  return data;
}
