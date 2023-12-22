# Tab Harmony

*A place for every tab, and every tab in its place.*

Do you have too many tabs? Tab Harmony is a Chrome extension that keeps your tabs organized!

## Features

* Tabs are sorted alphabetically according to their *reversed domain name*. Instead of sorting `mail.google.com` under "M" and `calendar.google.com` under "C", Tab Harmony treats these domains as `google.mail` and `google.calendar`. They are always sorted next to each other under "G" for Google!

* When you have lots of open tabs that share a common *domain suffix* (for example, `*.google.com`), Tab Harmony puts them in a new tab group named after that suffix (in this example, `google`). By default, at least 4 tabs must share a suffix before they are grouped. This value is configurable as well as the colors assigned to each tab group!

* (**Since v0.2.0**) Subdomains will split off into their own group if they themselves contain enough tabs in common. For example, if the `google` tab group contains 4 tabs for `*.docs.google.com`, then a new tab group for `google docs` will be created automatically.

* (**Since v0.3.0**) Specify alternate domain names to change the sort order and generated group names. For example, specify `search.google.com` as an alternate domain name for `www.google.com/search`; search results will be grouped as `google search`.

* **ALL** tabs are sorted and grouped *every* time you navigate to a new URL. No need to press a hotkey! Stop organizing your tabs by hand - let Tab Harmony organize them for you!

## Credits
Icon made by Icongeek26 from www.flaticon.com