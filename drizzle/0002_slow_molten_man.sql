ALTER TABLE "target" ADD COLUMN "watchNote" text;--> statement-breakpoint
ALTER TABLE "target" ADD COLUMN "lastError" text;--> statement-breakpoint
ALTER TABLE "target" ADD COLUMN "lastErrorAt" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "target" ADD COLUMN "lastScreenshotUrl" text;--> statement-breakpoint
ALTER TABLE "target" ADD COLUMN "lastScreenshotAt" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "website" ADD COLUMN "publicShareToken" text;--> statement-breakpoint
ALTER TABLE "website" ADD CONSTRAINT "website_publicShareToken_unique" UNIQUE("publicShareToken");