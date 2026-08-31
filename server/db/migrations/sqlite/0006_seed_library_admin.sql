ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
UPDATE `users`
SET `role` = 'admin'
WHERE lower(`email`) = 'leonardo.prasetyo5@gmail.com'
   OR lower(`username`) = 'beanmommo';
--> statement-breakpoint
INSERT INTO `users` (
	`id`,
	`email`,
	`name`,
	`avatar`,
	`username`,
	`provider`,
	`provider_id`,
	`created_at`,
	`role`
)
SELECT
	'library-admin-leonardo-prasetyo',
	'leonardo.prasetyo5@gmail.com',
	'Leonardo Prasetyo',
	'',
	'beanmommo',
	'github',
	'pending-admin-github-identity',
	unixepoch(),
	'admin'
WHERE NOT EXISTS (
	SELECT 1
	FROM `users`
	WHERE `role` = 'admin'
	  AND (
		lower(`email`) = 'leonardo.prasetyo5@gmail.com'
		OR lower(`username`) = 'beanmommo'
	  )
);
