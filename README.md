# Motisma'Pau

A Discord bot for the Pokémon GO community of Pau, France.

It serves two goals: letting each player see that they are not isolated in their area,
and making it easy to organize outings, without ever revealing any personal
information.

## Planned features

### Area map
- Displays the play areas of Pau (Beaumont, Pesquidoux, Lons, etc.) with a player
  count per area.
- A `/map` command returns an image (PNG) directly in Discord, with no external
  website required.
- Data comes from the Discord roles that players assign to themselves through
  "Channels & Roles". No extra input, no duplicates.
- No location or address is ever exposed: only the area a player voluntarily selected
  is counted.
- An area only shows its counter once at least three players have joined it, to
  preserve anonymity.

### Meetups
- A command creates a temporary thread for an outing: place, time, and sign-ups by
  reaction.
- The thread is archived or deleted automatically after the event.
- A reminder is sent automatically before the meetup.

## Design principle

The bot relies on a single source of truth: the players' "area" roles.

```
Player on Discord
   |  (selects their area through "Channels & Roles")
   v
Motisma'Pau  --- reads roles --->  "Area" roles (permanent)
   |
   |-- /map   -> generates a PNG of the areas with counters
   '-- /rdv   -> creates a temporary thread for an outing
```

| Element            | Purpose                     | Form                     | Lifetime  |
|--------------------|-----------------------------|--------------------------|-----------|
| "Area" roles       | Feed the map                | "Channels & Roles" roles | Permanent |
| Meetup threads     | Organize an outing          | Threads created by the bot | Ephemeral |

## Privacy

- No geolocation, no address, no individual position.
- The area is declarative and voluntary: the player selects their own role.
- The map only shows aggregated counts per area, never an isolated player (minimum
  threshold of three players).

## Project status

Early implementation. The bot connects, registers its slash commands, and provides a
first version of `/map` (text summary) and `/rdv` (temporary thread). PNG map
rendering and reminders are still on the roadmap.

## Tech stack

- Node.js (>= 18), ES modules
- [discord.js](https://discord.js.org/) v14
- Map PNG rendering: planned with a canvas library (e.g. `@napi-rs/canvas`)

## Getting started

```bash
npm install
cp .env.example .env      # then fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID
npm run deploy            # register the slash commands on the guild
npm start                 # start the bot
```

Enable the **Server Members Intent** in the Discord Developer Portal
(Bot > Privileged Gateway Intents) — it is required to count players per area.

## Project structure

```
src/
  index.js            Bot entry point (client, command loading, events)
  deploy-commands.js  Registers slash commands on the guild
  config.js           Loads and validates environment variables
  config/sectors.js   Play areas of Pau and their role IDs
  commands/
    map.js            /map  — players per area
    rdv.js            /rdv  — create a temporary outing thread
  services/
    sectors.js        Counts members per sector role
    mapRenderer.js    PNG map rendering (planned)
```

## Roadmap

- [ ] Define the list of Pau areas and create the matching roles
- [ ] Prepare the base map (background image with the areas drawn)
- [ ] Prototype: `/map` command generating a PNG with counters
- [ ] `/rdv` command: temporary thread creation and sign-ups
- [ ] Automatic reminders before outings
- [ ] Optional interactive web app to complement the PNG

## License

Released under the MIT License. See the `LICENSE` file.

---

Community project, not affiliated with Niantic or The Pokémon Company.
Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK inc.
