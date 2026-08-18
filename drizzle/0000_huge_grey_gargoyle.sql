CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`target_price` integer,
	`report` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_scans_created_at` ON `scans` (`created_at`);