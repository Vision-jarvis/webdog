ALTER TABLE "alert" ADD COLUMN "suppressed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "suppressionReason" text;--> statement-breakpoint
ALTER TABLE "target" ADD COLUMN "aiTriageEnabled" boolean DEFAULT false NOT NULL;