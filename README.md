
# PathoConnect

A laboratory report management system with frontend in React and backend in Node.js with MongoDB.

## Project Structure

The project consists of two parts:

### Frontend (React)

Located in the main directory. A React application with Tailwind CSS for styling.

### Backend (Node.js/Express)

Located in the `api` directory. A Node.js application using Express and MongoDB.

## Setting Up the Project

### Frontend Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

### Backend Setup

1. Navigate to the api directory:
   ```
   cd api
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```

4. Update the `.env` file with your MongoDB connection string and JWT secret.

5. Start the development server:
   ```
   npm run dev
   ```

## Features

- User authentication (Doctor and Technician roles)
- Create and manage laboratory reports
- Doctor verification workflow
- Customizable report fields and normal values
- PDF generation and sharing

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Report Fields

- `GET /api/report-fields` - Get all report fields
- `GET /api/report-fields/:reportType` - Get fields for a specific report type
- `PUT /api/report-fields/:reportType/:fieldId` - Update a report field (Doctors only)
- `POST /api/report-fields/:reportType` - Create a new field (Doctors only)
- `DELETE /api/report-fields/:reportType/:fieldId` - Delete a field (Doctors only)

### Reports

- `GET /api/reports` - Get all reports
- `GET /api/reports/:id` - Get a specific report
- `POST /api/reports` - Create a new report
- `PUT /api/reports/:id` - Update a report
- `DELETE /api/reports/:id` - Delete a report (Doctors only)
