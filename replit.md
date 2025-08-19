# Overview

This is an advanced Discord bot that automatically posts daily 2-choice polls with exactly 24-hour voting periods and result announcements. The bot features interactive button-based voting, real-time result tracking, comprehensive user statistics, and dual Google Sheets integration for centralized question database management and complete voter data export for analytics and research purposes.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Bot Framework
- **Discord.js v14**: Core Discord API integration with slash commands, button interactions, and embedded messages
- **Node.js with ES6 modules**: Modern JavaScript runtime with import/export syntax
- **Cron-based scheduling**: Uses node-cron for automated daily poll posting at configurable times

## Data Storage
- **SQLite with better-sqlite3**: Lightweight, file-based database for storing poll data, user votes, and bot settings
- **Dual Google Sheets Integration**: 
  - **Questions Database**: Centralized spreadsheet with comprehensive question management (categories, usage tracking, difficulty levels)
  - **Voter Data Export**: Complete export of all voting events, poll results, and user analytics for research purposes
  - **User Statistics Tracking**: Automated export of individual user behavior patterns and preferences
- **JSON file storage**: Fallback question bank stored in questions.json when Google Sheets is disabled
- **Database schema**: Extended tables with polls, votes, settings, plus comprehensive logging to Google Sheets

## Poll Management System
- **Automated scheduling**: Configurable cron jobs for daily poll posting (default 9:00 AM Hong Kong time)
- **24-hour poll lifecycle**: Automatic poll closure and result announcement after exactly 24 hours
- **Interactive voting**: Discord button components for vote submission with ability to change votes
- **Real-time vote tracking**: Live percentage calculations and vote tallying

## Admin Interface
- **Enhanced Slash command system**: Modern Discord slash commands including sync-questions for Google Sheets integration
- **Channel management**: Admin commands to set designated poll channels
- **Manual poll controls**: Ability to post immediate 24-hour polls outside of scheduled timing
- **Advanced question management**: Commands to add questions locally or directly to Google Sheets database
- **Data synchronization**: Admin commands to sync questions from Google Sheets and export user statistics

## Google Sheets Integration
- **Dual Database System**: Two separate Google Sheets for questions management and voter data export
  - **Questions Sheet**: Centralized database with id, questions, categories, usage tracking, and metadata
  - **Voter Data Sheet**: Complete export of voting events with timestamps, user data, and poll results
  - **User Statistics Sheet**: Automated tracking of individual user analytics and behavioral patterns
- **Service account authentication**: Secure Google Sheets access using service account credentials
- **Real-time logging**: All poll events, votes, and closures automatically logged with comprehensive metadata
- **Smart question selection**: Bot intelligently picks questions from Google Sheets database with usage tracking

## Security & Configuration
- **Environment-based configuration**: All sensitive data and settings managed through .env files
- **Permission-based access**: Discord permission checks for admin commands
- **Timezone support**: Configurable timezone handling for global deployment (default Asia/Hong_Kong)

# External Dependencies

## Core Discord Integration
- **Discord.js**: Primary Discord API library for bot functionality, slash commands, and UI components
- **Discord Developer Portal**: Bot token, application ID, and permission management

## Database & Storage
- **better-sqlite3**: Local SQLite database for persistent data storage
- **File system**: Local file storage for database files and configuration

## Scheduling & Time Management
- **node-cron**: Automated task scheduling for daily poll posting
- **dayjs**: Date/time manipulation with timezone support
- **dayjs timezone plugins**: UTC and timezone conversion capabilities

## Optional Google Services
- **Google Sheets API**: Data export and question management integration
- **google-spreadsheet npm package**: Google Sheets API client library
- **Google Service Account**: Authentication for programmatic spreadsheet access

## Development & Configuration
- **dotenv**: Environment variable management for configuration and secrets
- **Node.js runtime**: ES6 module support and async/await functionality