# FarmNest 🌾 — Agricultural Marketplace App

> A full-scale mobile marketplace connecting Farmers, Buyers, Investors, and Admins.
> Built as a Final Year Project at KFUEIT, Pakistan.

---

## About

FarmNest solves the disconnect between agricultural producers and buyers in Pakistan by providing a unified digital marketplace with real-time features, multilingual support, and a secure moderation system.

## Features

- **Crop Listings** — Farmers post produce with GPS location (OpenStreetMap Nominatim)
- **Auction & Bidding** — Real-time bidding with payment countdown timer and penalty system
- **Investor Funding** — Investors post funding offers; farmers apply directly
- **In-App Messaging** — Chat with voice note support across all user roles
- **Mandi Price Charts** — Live local market price reference
- **Bilingual UI** — Full English/Urdu interface with RTL support
- **Liveness Detection** — Secure registration with face liveness check
- **Push Notifications** — OneSignal-powered bilingual notifications
- **Admin Panel** — User moderation, order management, account controls

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile Framework | React Native 0.80 (TypeScript) |
| Database | Firebase Firestore |
| Authentication | Firebase Auth |
| Media Uploads | Cloudinary |
| Push Notifications | OneSignal (REST API) |
| Navigation | React Navigation |
| Email | EmailJS |
| Geocoding | OpenStreetMap Nominatim |

## User Roles

- **Farmer** — Post crops, manage listings, receive bids
- **Buyer** — Browse crops, place bids, make payments
- **Investor** — Post funding offers, connect with farmers
- **Main Admin** — Full platform control
- **Simple Admin** — Moderation and support

## Project Info

- University: KFUEIT, Rahim Yar Khan, Pakistan
- Developer: Muhammad Muavia
- Type: Final Year Project (FYP)
- Platform: Android (React Native)