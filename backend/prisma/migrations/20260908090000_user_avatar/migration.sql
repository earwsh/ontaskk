-- Profile photo. Null keeps the initials avatar, which stays the fallback.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
