CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`group_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`group_id`, `email`)
);
--> statement-breakpoint
CREATE INDEX `members_email` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`data` text NOT NULL,
	`photo` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL,
	`author` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_group` ON `records` (`group_id`);