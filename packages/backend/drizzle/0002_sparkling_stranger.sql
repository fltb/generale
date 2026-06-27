CREATE TABLE `custom_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`tile_count` integer NOT NULL,
	`min_players` integer DEFAULT 2 NOT NULL,
	`max_players` integer DEFAULT 8 NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`is_draft` integer DEFAULT true NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`tags` text,
	`created_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` integer DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
