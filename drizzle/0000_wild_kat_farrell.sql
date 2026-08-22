CREATE TABLE `user_ideas` (
	`user_id` text NOT NULL,
	`event_ticker` text NOT NULL,
	`idea_id` text NOT NULL,
	`disposition` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `event_ticker`),
	CONSTRAINT "user_ideas_disposition_check" CHECK("user_ideas"."disposition" IN ('research', 'later', 'passed'))
);
--> statement-breakpoint
CREATE INDEX `user_ideas_user_updated_idx` ON `user_ideas` (`user_id`,`updated_at`);