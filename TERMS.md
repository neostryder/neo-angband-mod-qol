# Terms of Use for the Neo Angband Quality of Life Mod

Effective date: 2026-08-23.

Quality of Life is an optional mod folder that runs inside Neo Angband, with no separate hosted service. It provides convenience behavior that is not part of the faithful Angband 4.2.6 base game. Current options include auto-dig on movement, remembered settings, optional remembered cheat settings, continued pref-file reading after an error, and hover/hold inspection cards on the Map overview screen. The mod is disabled until enabled, and its individual options can be changed in the mod controls.

When its remembered-settings option is enabled, the mod stores selected option values in the host's local mod-preference storage so they can be applied to new characters. It does not create an account or send those preferences to a project-operated service. Remembering cheat options is off by default because those options can permanently exclude a character from the score list. The player is responsible for choosing settings and for keeping an export or backup of local game data.

Its shipped manifest does not declare network access, and its shipped plugin code makes no network requests. It declares the core backup-folder capability only so the player can choose a folder to receive importable save backups, and the mod never learns that folder's real path. Installing or updating it from the in-game mod manager can still fetch its public files from GitHub; those requests come from the Neo Angband host's mod manager. The core Neo Angband Terms and Privacy Policy cover that shared host behavior, including local storage, update checks, and the risks of optional third-party mods.

The GPL v2 or Angband licence in `LICENSE.md` governs copying, modification, and distribution of covered material. This document does not add a condition to those rights. The mod is provided as available and without a promise of compatibility, availability, security, accuracy, or fitness for a particular purpose, to the extent permitted by applicable law.

Use must comply with applicable law, the applicable licences, and the Neo Angband Terms. Project participation is subject to the shared Code of Conduct.
