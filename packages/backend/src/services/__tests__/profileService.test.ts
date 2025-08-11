import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileService } from '../profileService';
import { db } from '../../db/client';

// Mock the db client
vi.mock('../../db/client', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    run: vi.fn(),
  },
}));

describe('ProfileService', () => {
  let profileService: ProfileService;
  const mockDb = db as any;

  beforeEach(() => {
    profileService = new ProfileService();
    vi.clearAllMocks();
    
    // Reset the fluent API mock chain for insert/update
    const mockRun = vi.fn();
    const mockOnConflict = vi.fn(() => ({ run: mockRun }));
    const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflict }));
    mockDb.insert.mockImplementation(() => ({ values: mockValues }));
  });

  const userId = 'user-abc';

  it('should get a user profile', async () => {
    const profileData = { userId, avatarUrl: 'http://avatar.com/img.png', bio: 'My bio' };
    mockDb.get.mockResolvedValue(profileData);

    const profile = await profileService.getProfile(userId);

    expect(mockDb.select).toHaveBeenCalled();
    expect(mockDb.from).toHaveBeenCalledWith(expect.any(Object)); // profiles table
    expect(mockDb.where).toHaveBeenCalled();
    expect(profile).toEqual(profileData);
  });

  it('should return undefined if profile does not exist', async () => {
    mockDb.get.mockResolvedValue(undefined);
    const profile = await profileService.getProfile(userId);
    expect(profile).toBeUndefined();
  });

  it('should update avatar using upsert logic', async () => {
    const avatarUrl = 'http://new.avatar.com/pic.jpg';
    await profileService.updateAvatar(userId, avatarUrl);

    const mockValuesCall = mockDb.insert().values;
    const mockOnConflictCall = mockValuesCall.mock.results[0].value.onConflictDoUpdate;

    expect(mockValuesCall).toHaveBeenCalledWith({ userId, avatarUrl });
    expect(mockOnConflictCall).toHaveBeenCalledWith({
      target: expect.any(Object), // profiles.userId
      set: { avatarUrl },
    });
    expect(mockOnConflictCall.mock.results[0].value.run).toHaveBeenCalled();
  });

  it('should update bio using upsert logic', async () => {
    const bio = 'A new exciting bio.';
    await profileService.updateBio(userId, bio);
    
    const mockValuesCall = mockDb.insert().values;
    const mockOnConflictCall = mockValuesCall.mock.results[0].value.onConflictDoUpdate;

    expect(mockValuesCall).toHaveBeenCalledWith({ userId, bio });
    expect(mockOnConflictCall).toHaveBeenCalledWith({
      target: expect.any(Object), // profiles.userId
      set: { bio },
    });
    expect(mockOnConflictCall.mock.results[0].value.run).toHaveBeenCalled();
  });

  it('should update the entire profile with partial data', async () => {
    const updates = { bio: 'A full update', avatarUrl: 'http://full.update/img.png' };
    await profileService.updateProfile(userId, updates);

    const mockValuesCall = mockDb.insert().values;
    const mockOnConflictCall = mockValuesCall.mock.results[0].value.onConflictDoUpdate;

    expect(mockValuesCall).toHaveBeenCalledWith({ userId, ...updates });
    expect(mockOnConflictCall).toHaveBeenCalledWith({
      target: expect.any(Object), // profiles.userId
      set: updates,
    });
    expect(mockOnConflictCall.mock.results[0].value.run).toHaveBeenCalled();
  });
});