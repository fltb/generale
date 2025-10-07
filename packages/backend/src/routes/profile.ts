import { Elysia } from 'elysia';
import { profileService } from '../services/profileService';
import { sessionService } from '../services/sessionService';
import {
  profileRespSchema,
  profileUpdateReqSchema,
  avatarUploadReqSchema,
  avatarUploadRespSchema,
  errorRespSchema,
  messageRespSchema
} from '@generale/types/dist/api';

export const profileRoutes = new Elysia({prefix: '/profile'})
  .get('/:userId', 
    async ({ params: { userId }, set }) => {
      const profile = await profileService.getProfile(userId);
      if (!profile) {
        set.status = 404;
        return { error: 'Profile not found' };
      }
      return {
        userId: profile.userId,
        ...(profile.avatarUrl && { avatarUrl: profile.avatarUrl }),
        ...(profile.bio && { bio: profile.bio }),
        ...(profile.updatedAt && { updatedAt: profile.updatedAt.toISOString() })
      };
    },
    {
      response: {
        200: profileRespSchema,
        404: errorRespSchema
      }
    }
  )
  .post('/update', 
    async ({ body, cookie: { session }, set }) => {
      const sessionId = session?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      await profileService.updateProfile(userId, body);
      return { success: true, message: 'Profile updated successfully' };
    },
    {
      body: profileUpdateReqSchema,
      response: {
        200: messageRespSchema,
        401: errorRespSchema
      }
    }
  )
  .post('/upload', 
    async ({ body: { file }, cookie: { session }, set }) => {
      const sessionId = session?.value;
      const userId = sessionId ? sessionService.get(sessionId)?.userId : undefined;
      if (!userId) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      
      if (!file) {
        set.status = 400;
        return { error: 'No file provided' };
      }
      
      const ext = file.name.split('.').pop() || 'png';
      const filename = `${userId}-${Date.now()}.${ext}`;
      const filePath = `/uploads/avatars/${filename}`;
      
      await Bun.write(`./public${filePath}`, file);
      
      const avatarUrl = `/avatars/${filename}`;
      await profileService.updateAvatar(userId, avatarUrl);
      
      return { 
        success: true, 
        avatarUrl,
        message: 'Avatar uploaded successfully' 
      };
    },
    {
      body: avatarUploadReqSchema,
      response: {
        200: avatarUploadRespSchema,
        400: errorRespSchema,
        401: errorRespSchema
      }
    }
  );

export default profileRoutes;
