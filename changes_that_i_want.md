- change in code where variables are called "url" to "hostname"
- similary no need for "tab" prefix. 
- i want editor page to have list of saved styles on the left
	- editors don't have to have clear and done buttons
- i want to have global and per-tab toggles in popup page
	- and global ones in editor page
- updating styles should work better
	- issues:
		- it is possible to insertCss multiple times
		- when the style changes, it is immpossible to remove old one, so script now reloads every such tab
	- fixes:
		- on every css update, remove all css and then if enabled, insert it
			e.g. `while (not all removed) { removecss() }; if (enabled) { insertCss() }`
			note that remove and insert is async, avoid infinite loops (need to await)
		- on changes remember the old style, remove it, and insert the new one
- i want global style (applied to all tabs)
	easily done actually:
	- use "*" as hostname 
		no tab can have that as it's hostname, so it can work as reserved catch-all hostname
		(i want your push back on that! is it really impossible to have that as hostname)
	- when querying from storage.sync, query for both tab's hstname and for hardcoded "*"
- popup can have it's hostname at the top (why not)
- editor needs "add hostname" button which will add entry to list on the left
	- hostname should be editable only when creating new entry
		- if someone madde a spelling mistake, they can add new entry and copy old css to new css
