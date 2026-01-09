/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Router } from 'express';
import { z } from 'zod';
import { refreshTokenIfNeeded } from '../lib/deviantart.js';
import { AppError } from '../middleware/error.js';

const router = Router();

const DEVIANTART_API_URL = 'https://www.deviantart.com/api/v1/oauth2';

// Helper function to make DeviantArt API calls
async function callDeviantArtAPI(
  accessToken: string,
  method: string,
  endpoint: string,
  body?: any,
  params?: Record<string, string>
) {
  const url = new URL(`${DEVIANTART_API_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    ...(body && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  };

  const response = await fetch(url.toString(), options);

  if (!response.ok) {
    let errorMessage = 'DeviantArt API request failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error_description || errorData.error || errorMessage;
    } catch {
      errorMessage = (await response.text()) || errorMessage;
    }

    console.error('DeviantArt API error:', {
      status: response.status,
      endpoint,
      message: errorMessage,
    });

    if (response.status === 401) {
      throw new AppError(401, 'Authentication failed');
    }
    if (response.status === 429) {
      throw new AppError(429, 'Rate limit exceeded');
    }

    throw new AppError(response.status, errorMessage);
  }

  return await response.json();
}

// GET /gallery/folders - Fetch gallery folders
router.get('/folders', async (req, res) => {
  const user = req.user!;

  try {
    const accessToken = await refreshTokenIfNeeded(user);
    const data = await callDeviantArtAPI(accessToken, 'GET', '/gallery/folders', undefined, {
      calculate_size: (req.query.calculate_size as string) || 'false',
      ext_preload: (req.query.ext_preload as string) || 'false',
      limit: (req.query.limit as string) || '10',
      offset: (req.query.offset as string) || '0',
    });

    res.json({
      galleries: data.results || [],
      hasMore: data.has_more,
      nextOffset: data.next_offset,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error fetching gallery folders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/all', async (req, res) => {
  const user = req.user!;

  try {
    const accessToken = await refreshTokenIfNeeded(user);

    // Enforce DeviantArt API limit: min 1, max 50
    const requestedLimit = parseInt((req.query.limit as string) || '24');
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const offset = parseInt((req.query.offset as string) || '0');

    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      mature_content: 'true',
      calculate_size: (req.query.calculate_size as string) || 'true',
      ext_preload: (req.query.ext_preload as string) || 'true',
    });

    const url = `${DEVIANTART_API_URL}/gallery/folders?${params}`;

    console.log('[GALLERIES /all] Making request to:', url);
    console.log('[GALLERIES /all] Parameters:', Object.fromEntries(params));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to fetch galleries';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error_description || errorData.error || errorMessage;
      } catch {
        errorMessage = (await response.text()) || errorMessage;
      }

      console.error('DeviantArt API error:', {
        status: response.status,
        endpoint: '/gallery/folders',
        message: errorMessage,
      });

      return res.status(response.status).json({ error: errorMessage });
    }

    const data = await response.json();

    res.json({
      galleries: data.results || [],
      hasMore: data.has_more,
      nextOffset: data.next_offset,
    });
  } catch (error: any) {
    console.error('Error fetching all gallery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /gallery/{folderid} - Fetch gallery folder contents
router.get('/:folderId', async (req, res) => {
  const { folderId } = req.params;
  const user = req.user!;

  try {
    console.log('[GALLERY DETAIL] Fetching contents for folder:', folderId);
    console.log('[GALLERY DETAIL] Query params:', req.query);

    const accessToken = await refreshTokenIfNeeded(user);

    // DeviantArt API /gallery/{folderid}
    const params: Record<string, string> = {
      limit: (req.query.limit as string) || '24',
      offset: (req.query.offset as string) || '0',
      mature_content: 'true',
    };

    console.log('[GALLERY DETAIL] Calling DeviantArt API with params:', params);

    const data = await callDeviantArtAPI(
      accessToken,
      'GET',
      `/gallery/${folderId}`,
      undefined,
      params
    );

    // Transform DeviantArt response format to expected frontend format
    const results = data.results || [];
    res.json({
      results,
      hasMore: data.has_more,
      nextOffset: data.next_offset,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error fetching gallery folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/create - Create new gallery folder
const createFolderSchema = z.object({
  folder: z.string().min(1).max(50),
  parent: z.string().optional(),
  description: z.string().optional(),
});

router.post('/folders/create', async (req, res) => {
  const user = req.user!;

  try {
    const data = createFolderSchema.parse(req.body);
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('folder', data.folder);
    if (data.parent) formData.append('parent', data.parent);
    if (data.description) formData.append('description', data.description);

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to create folder');
    }

    const result = await response.json();
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error creating gallery folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/update_order - Rearrange the position of folders
const updateFolderOrderSchema = z.object({
  folderids: z.array(z.string()).min(1),
});

router.patch('/folders/order', async (req, res) => {
  console.log('=== ROUTE HIT ===');
  console.log('Request body:', req.body);
  console.log('Body type:', typeof req.body);
  const user = req.user!;

  try {
    console.log('Received folder reorder request:', JSON.stringify(req.body));
    const data = updateFolderOrderSchema.parse(req.body);
    console.log('Validated folder IDs:', data.folderids);
    const accessToken = await refreshTokenIfNeeded(user);

    // Get current folder order from DeviantArt to compare - fetch ALL folders
    const currentOrder: string[] = [];
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const currentResponse = await fetch(
        `${DEVIANTART_API_URL}/gallery/folders?calculate_size=false&ext_preload=false&limit=50&offset=${offset}&mature_content=true`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!currentResponse.ok) {
        throw new AppError(currentResponse.status, 'Failed to fetch current folder order');
      }

      const currentData = await currentResponse.json();
      currentOrder.push(...currentData.results.map((f: any) => f.folderid));

      hasMore = currentData.has_more;
      offset = currentData.next_offset || 0;
    }

    console.log(`Fetched ${currentOrder.length} total folders from DeviantArt`);

    // Find folders that changed position
    const foldersToUpdate: { folderId: string; newPosition: number }[] = [];

    data.folderids.forEach((folderId, newIndex) => {
      const oldIndex = currentOrder.indexOf(folderId);
      if (oldIndex !== newIndex) {
        foldersToUpdate.push({ folderId, newPosition: newIndex });
      }
    });

    console.log(
      `Only ${foldersToUpdate.length} folders need updating (out of ${data.folderids.length})`
    );

    if (foldersToUpdate.length === 0) {
      return res.json({
        success: true,
        updated: 0,
        message: 'No changes needed',
      });
    }

    // DeviantArt API handles one folder at a time
    // Make sequential API calls with delays to avoid rate limiting
    const results = [];
    const DELAY_MS = 150; // 150ms delay between requests

    for (let i = 0; i < foldersToUpdate.length; i++) {
      const { folderId, newPosition } = foldersToUpdate[i];

      // Add delay between requests (except for the first one)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }

      const formData = new URLSearchParams();
      formData.append('folderid', folderId);
      formData.append('position', String(newPosition));

      console.log(
        `Updating folder ${i + 1}/${foldersToUpdate.length}: ${folderId} to position ${newPosition}`
      );

      const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/update_order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DeviantArt API error for folder ${folderId}:`, errorText);
        throw new AppError(response.status, `Failed to update folder ${folderId}: ${errorText}`);
      }

      const result = await response.json();
      results.push(result);
    }

    console.log(`Successfully updated ${results.length} folders`);
    res.json({ success: true, updated: results.length });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error updating folder order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/update - Update gallery folder
const updateFolderSchema = z.object({
  folderid: z.string(),
  foldername: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
});

router.patch('/folders/:folderId', async (req, res) => {
  const { folderId } = req.params;
  const user = req.user!;

  try {
    const data = updateFolderSchema.parse({ ...req.body, folderid: folderId });
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('folderid', data.folderid);
    if (data.foldername) formData.append('foldername', data.foldername);
    if (data.description) formData.append('description', data.description);

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/update`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to update folder');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error updating gallery folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/remove/{folderid} - Delete gallery folder
router.delete('/folders/:folderId', async (req, res) => {
  const { folderId } = req.params;
  const user = req.user!;

  try {
    const accessToken = await refreshTokenIfNeeded(user);

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/remove/${folderId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to delete folder');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting gallery folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/move - Move folder to another folder
const moveFolderSchema = z.object({
  folderid: z.string(),
  parentid: z.string(),
});

router.post('/folders/move', async (req, res) => {
  const user = req.user!;

  try {
    const data = moveFolderSchema.parse(req.body);
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('folderid', data.folderid);
    formData.append('parentid', data.parentid);

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/move`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to move folder');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error moving folder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/copy_deviations - Copy deviations to a folder
const copyDeviationsSchema = z.object({
  target_folderid: z.string(),
  deviationids: z.array(z.string()).min(1),
});

router.post('/folders/copy-deviations', async (req, res) => {
  const user = req.user!;

  try {
    const data = copyDeviationsSchema.parse(req.body);
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('target_folderid', data.target_folderid);
    data.deviationids.forEach((id) => formData.append('deviationids[]', id));

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/copy_deviations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to copy deviations');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error copying deviations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/move_deviations - Move deviations to a folder
const moveDeviationsSchema = z.object({
  target_folderid: z.string(),
  deviationids: z.array(z.string()).min(1),
});

router.post('/folders/move-deviations', async (req, res) => {
  const user = req.user!;

  try {
    const data = moveDeviationsSchema.parse(req.body);
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('target_folderid', data.target_folderid);
    data.deviationids.forEach((id) => formData.append('deviationids[]', id));

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/move_deviations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to move deviations');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error moving deviations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/remove_deviations - Remove deviations from a gallery folder
const removeDeviationsSchema = z.object({
  folderid: z.string(),
  deviationids: z.array(z.string()).min(1),
});

router.delete('/folders/:folderId/deviations', async (req, res) => {
  const { folderId } = req.params;
  const user = req.user!;

  try {
    const data = removeDeviationsSchema.parse({
      ...req.body,
      folderid: folderId,
    });
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('folderid', data.folderid);
    data.deviationids.forEach((id) => formData.append('deviationids[]', id));

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/remove_deviations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to remove deviations');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error removing deviations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /gallery/folders/update_deviation_order - Update order of deviations in folder
const updateDeviationOrderSchema = z.object({
  folderid: z.string(),
  deviationids: z.array(z.string()).min(1),
});

router.patch('/folders/:folderId/deviation-order', async (req, res) => {
  const { folderId } = req.params;
  const user = req.user!;

  try {
    const data = updateDeviationOrderSchema.parse({
      ...req.body,
      folderid: folderId,
    });
    const accessToken = await refreshTokenIfNeeded(user);

    const formData = new URLSearchParams();
    formData.append('folderid', data.folderid);
    data.deviationids.forEach((id) => formData.append('deviationids[]', id));

    const response = await fetch(`${DEVIANTART_API_URL}/gallery/folders/update_deviation_order`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, errorText || 'Failed to update deviation order');
    }

    const result = await response.json();
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error updating deviation order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as galleriesRouter };
