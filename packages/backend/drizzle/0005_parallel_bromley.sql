CREATE TABLE `game_results` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`game_type` text NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_ms` integer,
	`participants` text NOT NULL,
	`state_snapshot` text
);
--> statement-breakpoint
CREATE TABLE `game_user_settings` (
	`user_id` text NOT NULL,
	`game_type` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer,
	PRIMARY KEY(`user_id`, `game_type`, `key`)
);
