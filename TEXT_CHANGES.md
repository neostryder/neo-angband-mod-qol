# Text changes: Misc. niceties

This page lists every change the Misc. niceties switch (`qol.miscNiceties`) makes to the text of Angband 4.2.6. None of them fixes a mistake. They make a description or message clearer, or word it the way the rest of the game already does. Turn the switch off and you see the Before text, exactly as upstream wrote it. The mod's README describes the switch's display conveniences.

15 description and game data changes, 1 message change.

## Activations

### RAGE_BLESS_RESIST (`msg`)

Upstream `lib/gamedata/activation.txt:847`, consistency.

Before:

> {name} glow{s} many colors...

After:

> {name} glow{s} many colours...

The sibling RESIST_ALL message (activation.txt:428) spells it "colours" in the same phrase. This matches it.

### SHROOM_EMERGENCY (`desc`)

Upstream `lib/gamedata/activation.txt:1323`, awkward.

Before:

> grants temporary resistance to fire and cold, cures 200HP, but also makes you hallucinate wildly

After:

> grants temporary resistance to fire and cold, heals 200HP, but also makes you hallucinate wildly

Hit points are healed rather than cured everywhere else in activation.txt. The verb now matches, with nothing else changed.

### STAFF_MAGI (`desc`)

Upstream `lib/gamedata/activation.txt:1263`, consistency.

Before:

> restores both intelligence and manapoints to maximum

After:

> restores both intelligence and mana points to maximum

"manapoints" appears only here, while RESTORE_MANA (activation.txt:215) says "mana points". This uses the spaced form.

## Class spells

### Blackguard (`book.0.spell.5.desc`)

Upstream `lib/gamedata/class.txt:1675-1676`, consistency.

Before:

> Your mind becomes too focused to be slowed, paralyzed or confused for 12+d12 turns.

After:

> Your mind becomes too focused to be slowed, paralyzed or confused for 12+1d12 turns.

Other class spell descriptions write their dice as 20+1d20, 24+1d24 and so on. This one writes 12+d12, the same value (class.txt 1671 dice:12+d12).

### Blackguard (`book.1.spell.3.desc`)

Upstream `lib/gamedata/class.txt:1705`, consistency.

Before:

> Coats all your melee weapons with poison for 18+d18 turns.

After:

> Coats all your melee weapons with poison for 18+1d18 turns.

Other class spell descriptions write their dice as 20+1d20, 24+1d24 and so on. This one writes 18+d18, the same value (class.txt 1704 dice:18+d18).

### Druid (`book.0.spell.4.desc`)

Upstream `lib/gamedata/class.txt:513`, consistency.

Before:

> Confuse a single monster; more effective against animals.

After:

> Confuses a single monster; more effective against animals.

Spell descriptions use the third person ("Slows down a monster" right below it). This one is an imperative.

### Druid (`book.3.spell.3.desc`)

Upstream `lib/gamedata/class.txt:627-628`, consistency.

Before:

> Speed up digestion to increase regeneration of hitpoints for the next 5+1d3 turns (or until hungry).

After:

> Speeds up digestion to increase regeneration of hitpoints for the next 5+1d3 turns (or until hungry).

Spell descriptions use the third person. This one is an imperative.

### Necromancer (`book.1.spell.1.desc`)

Upstream `lib/gamedata/class.txt:1045-1047`, consistency.

Before:

> Instantly kill any monster in line-of-sight with less than four times the player's level in hitpoints, also hurting the player. &nbsp;Other monsters are unharmed.

After:

> Instantly kills any monster in line of sight with less than four times the player's level in hitpoints, also hurting the player. &nbsp;Other monsters are unharmed.

Spell descriptions use the third person and write the noun as "line of sight" (Mass Sleep, Dispel Life, Banish Spirits). This one has an imperative "kill" and a hyphenated "line-of-sight".

## Curses

### vulnerability (`desc`)

Upstream `lib/gamedata/curse.txt:102`, clarity.

Before:

> attracts opponents and weakens the defences

After:

> attracts opponents and weakens your defences

The curse gives -50 to AC (curse.txt:95), which is the wearer's defence, but "the defences" leaves the owner unclear in "It attracts opponents and weakens the defences". This names the wearer.

## Monsters

### aimless-looking merchant (`desc`)

Upstream `lib/gamedata/monster.txt:449-450`, dated.

Before:

> The typical ponce around town, with purse jingling, and looking for more amulets of adornment to buy.

After:

> The typical dandy around town, with purse jingling, and looking for more amulets of adornment to buy.

'Ponce' is a British slur for an effeminate man or a pimp and reads as an insult today. 'dandy' keeps the vain town-shopper joke.

## Objects

### Protection (`desc`)

Upstream `lib/gamedata/object.txt:2214`, consistency.

Before:

> It increases your armor class.

After:

> It increases your armour class.

This is the only "armor" in any gamedata desc or msg line against 38 uses of "armour". This matches the house spelling.

## Traps

### dart trap:constitution loss dart (`desc`)

Upstream `lib/gamedata/trap.txt:280`, clarity.

Before:

> A trap which shoots damaging darts.

After:

> A trap which shoots constitution-draining darts.

The description hides what the trap does: besides 1d4 damage it drains constitution (trap.txt, effect:DRAIN_STAT), while the slow dart just above names its effect.

### dart trap:dexterity loss dart (`desc`)

Upstream `lib/gamedata/trap.txt:280`, clarity.

Before:

> A trap which shoots damaging darts.

After:

> A trap which shoots dexterity-draining darts.

The description hides what the trap does: besides 1d4 damage it drains dexterity (trap.txt, effect:DRAIN_STAT), while the slow dart just above names its effect.

### dart trap:strength loss dart (`desc`)

Upstream `lib/gamedata/trap.txt:280`, clarity.

Before:

> A trap which shoots damaging darts.

After:

> A trap which shoots strength-draining darts.

The description hides what the trap does: besides 1d4 damage it drains strength (trap.txt, effect:DRAIN_STAT), while the slow dart just above names its effect.

### gas trap:confusion gas trap (`msg`)

Upstream `lib/gamedata/trap.txt:334`, consistency.

Before:

> You are surrounded by a gas of scintillating colors!

After:

> You are surrounded by a gas of scintillating colours!

American "colors" in a trap message, where the fire and acid trap descriptions in the same file say "coloured" (trap.txt 239, 252). The game data mixes the two spellings, so this is offered as consistency rather than a fix.

## Messages

### The monster can not move.

Upstream `src/cmd-cave.c:1887`, consistency.

Before:

> The monster can not move.

After:

> The monster cannot move.

"can not" is the only split spelling in the player-facing messages, which otherwise use "cannot" throughout. The change joins it.
