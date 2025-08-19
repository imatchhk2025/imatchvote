# Discord 2-Choice Poll Bot

A Discord bot that automatically posts daily 24-hour polls with interactive button voting, comprehensive analytics, and dual Google Sheets integration for question management and voter data export.

## Features

### Core Poll System
- **Daily Automatic Polls**: Configurable scheduled posting (default 9:00 AM Hong Kong time)
- **24-Hour Duration**: Each poll runs for exactly 24 hours before auto-closing with result announcements
- **Interactive Voting**: Users vote via Discord buttons (can change votes during voting period)
- **Real-time Results**: Live vote tallying with percentage calculations displayed in poll embeds

### Analytics & Data Management
- **Comprehensive Personal Statistics**: Users can view detailed voting history, synchronization rates, and behavioral patterns
- **Dual Google Sheets Integration**:
  - **Questions Database**: Centralized question management with categories, difficulty levels, and usage tracking
  - **Voter Data Export**: Complete export of voting patterns, poll results, and user analytics for research
- **Admin Controls**: Set poll channels, add questions, post immediate polls, sync questions from sheets

### Data Insights
- **Synchronization Analysis**: Track how often users agree with majority opinions
- **Category Preferences**: Identify favorite question categories per user
- **Response Time Analytics**: Monitor how quickly users vote after polls start
- **Activity Tracking**: Weekly and monthly participation statistics

## Dual Google Sheets Database System

This bot uses TWO separate Google Sheets for data management:

### 1. Questions Database Sheet
Contains columns for comprehensive question management:
- **id, question_a, question_b**: Basic poll structure
- **tag, category**: Organization and filtering
- **usage_count**: Track how often questions are used
- **created_date, is_active**: Management controls
- **difficulty_level, notes**: Additional metadata

### 2. Voter Data Export Sheet
Contains columns for analytics and research:
- **event_type, timestamp, poll_id**: Event tracking
- **message_id, channel_id**: Discord integration data
- **question_a, question_b, tag**: Poll content
- **user_id, username, choice**: Voting information
- **votes_a, votes_b, percent_a, percent_b**: Result data
- **total_votes, poll_start, poll_end, poll_duration_hours**: Comprehensive metrics

### 3. User Statistics Sheet (Auto-generated)
Tracks individual user analytics:
- **user_id, username**: User identification
- **total_polls_participated, sync_rate_percent**: Participation metrics
- **favorite_categories, most_common_choice**: Preference analysis
- **polls_this_week, polls_this_month**: Activity tracking
- **average_response_time_minutes**: Behavioral analysis

## Setup Instructions

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the bot token and application ID
4. Enable the following bot permissions:
   - Send Messages
   - Use Slash Commands
   - Add Reactions
   - Read Message History
   - Embed Links
5. Invite bot to your server with these permissions

### 2. Environment Configuration

1. Copy `.env.example` to `.env`
2. Fill in your Discord credentials:
   ```env
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_id
   GUILD_ID=your_server_id
   