# After-Sales Platform Prototype

Early-stage prototype of a B2B software platform for **car dealerships and service workshops in the DACH region** (Germany, Austria, Switzerland).

> Status: prototype, pre-launch. No production use, no customer data.

## Problem

Dealerships lose service revenue in the gap between a vehicle's needs and the customer conversation: contact is manual, appointment initiation is slow, and customer and vehicle data live in disconnected systems.

## Focus areas

- **Customer contact:** structured, timely outreach to service customers
- **Service appointment initiation:** from first contact to a booked job with less manual work
- **CRM:** a single view of customer, vehicle and service history

## Current prototype scope

The first building block is **VIN-based vehicle identification**: when a vehicle record is created, the user enters the VIN and the technical vehicle data (make, model, model year, body type, engine and fuel type, drive, transmission, emission standard, dimensions and weights) is pre-filled automatically instead of typed in by hand.

We are evaluating VIN decoding APIs for coverage and field completeness on vehicles common in DACH (VW Group, BMW, Mercedes-Benz, Ford, Opel, Stellantis, including EVs).

## Planned work

- [ ] VIN decoding service with a provider-agnostic interface
- [ ] Coverage comparison across providers using a set of test VINs
- [ ] Vehicle record model and basic CRM data structure
- [ ] Simple UI for VIN entry and data review

## Tech

Not finalized. This repository will hold the prototype code once the architecture is settled.

## Data and privacy

- No real customer data is committed to this repository.
- API keys and secrets are never committed. Use environment variables (see `.gitignore`).
- Handling of VINs and vehicle data in production will be reviewed under GDPR before launch.

## Contact

Matthias Heine, digital product manager, Germany. Reach out via GitHub or LinkedIn.
