---
date: 2026-10-17
topic: leeward-game
---

# Leeward

## What we're building

A solo castaway game on the ocean that already exists in this repo. You wake on a beach, learn four trades, and grow strong enough to sail home to a household. That arrival closes the castaway chapter. Play continues from the house, and the ocean is still there.

People come back because yesterday's work is still on the beach and in the trades. Levels are never taken away.

## Why this approach

The game is a long progression with a real ending to the first chapter, in the spirit of a life you can keep living after the main goal. The alternative of a pure sailing simulator, a combat survival game, or a shared online world waits. This repo can already show open water and send a boat to a clicked point. It cannot yet show a shore, a person on foot, or a saved life.

## Key decisions

- **Promise:** stronger than yesterday. Skills, a better camp, and finds you can see.
- **Opening:** you wake in a daze on one deserted beach.
- **Trades on that island:** Forage, Cook, Craft, Sail. Each starts as a lesson and becomes work you can raise for a long time.
- **Hands:** you choose a job and stay with it while it resolves. You can watch the island and the sea. Sail is the exception: you pack, then you click a heading.
- **Treasures:** materials you spend, pieces you keep and display, and a few that raise a trade's ceiling or point toward home.
- **Time:** untimed. You may stay on a new island as long as you want.
- **Home:** whichever shore you have invested in most. The first beach starts ahead. A later island can overtake it.
- **A crossing:** you decide whether to go, and in what hull, with what food and water, for the weather and the distance. A bad plan costs the cargo and can damage the boat. You wash up on your own shore. Trade levels stay.
- **Hunger and thirst:** they matter while the camp is still fragile. After that they matter as the supplies you chose to load.
- **Other players:** each person has their own save. Sharing the game means giving someone the same beach to start.
- **The far shore:** a household. Family, a house, a role in a town. Arrival is a reunion. After it, sailing is something you leave the house to do.
- **Memory (working assumption):** the first days do not explain the household. Relics and flashes assemble a face, a street, and a house. The door confirms it.

## Story

You are alone, sunlit, and capable. The sea is the dangerous part.

The first island is a complete game. Places on it are worth a long stay. A few kept objects hint that someone is waiting, without turning the beach into a lecture.

Later shores add more to the same trades before they add a new way of life. The town is the chapter break. The quiet islands remain reachable. Who is in the house, what your role in town was, and why you were in the water stay open until that chapter is actually built.

## Builds, in order

Each build is something a person can play before the next one starts.

1. **Morning.** Wake on sand. Walk. Find water. Light a fire. Sleep under a shelter. Closing the tab keeps the morning. No skill numbers yet.
2. **Work.** Forage, Cook, and Craft are jobs. An hour of play changes the camp. Food and water threaten a poor camp and settle down once it holds.
3. **The first boat.** Craft produces a hull from island materials. You pack it, click a point past the shallows, and either return or wash up without the cargo. Sail changes which distance and weather you can honestly attempt.
4. **A full island.** Several places, spent materials, a display of kept finds, and relics that hint at a house and people. A long evening here is satisfying with no second island in the game. This is the first version worth sharing widely.
5. **Another shore.** Far enough that packing matters. You can start a camp. Enough investment can make it the better home. A bad crossing still costs only the trip.
6. **The door.** The town and the reunion. The castaway goal closes. The house becomes the place you leave when you sail. Older islands still load.

Builds 1–4 are the game. Builds 5–6 are the sequel chapter.

## Capabilities

Already in the repo: a real-time WebGPU ocean, a boat that sails to a clicked point, wind that changes speed, and a chase camera. Needs a recent Chrome with WebGPU.

Not in the repo yet, and required in this order: a shore you can stand on, a person who can walk and use things, a save, jobs that change the camp, a hull the player built, places and finds, a second shore, then the town.

## Open questions

- Who is in the household, and what you were to them.
- Why you were in the water.
- How early the first relic appears, and how plain its hint is.
- Whether home moving to a new island is something we tune in Build 5 or leave for later.

## Next

Correct the memory assumption or the build order if either is wrong. The following pass plans Build 1 only: the morning on the beach. No code until you ask for it.
