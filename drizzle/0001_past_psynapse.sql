CREATE TABLE `scan_limits` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer NOT NULL
);
