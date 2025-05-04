# NFTeams Mobile API Server

Backend API server for the NFTeams mobile application, built with Express.js, TypeScript, and Turso database.

## Setup

1. Clone the repository:
```bash
git clone [repository-url]
cd nfteams-mobile-api
```

2. Install dependencies:
```bash
npm install
```

3. Create a .env file in the root directory:
```env
PORT=3000
JWT_SECRET=your_jwt_secret
NEXT_PUBLIC_URL_FOUR=your_turso_url
NEXT_PUBLIC_TOKEN_FOUR=your_turso_token
NEXT_PUBLIC_API=your_alchemy_api_key
```

4. Start the development server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- POST `/api/auth/login` - User login
- POST `/api/auth/register` - User registration

### Teams
- GET `/api/teams/:wallet` - Get teams owned by wallet
- GET `/api/teams/score/:teamId` - Get team score

### Competition
- POST `/api/competition/enter` - Enter team in competition
- POST `/api/competition/update-scores` - Update competition scores

## Environment Variables

- `PORT`: Server port (default: 3000)
- `JWT_SECRET`: Secret key for JWT token generation
- `NEXT_PUBLIC_URL_FOUR`: Turso database URL
- `NEXT_PUBLIC_TOKEN_FOUR`: Turso database authentication token
- `NEXT_PUBLIC_API`: Alchemy API key for NFT verification

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run in production mode
npm start
```

## API Documentation

### Authentication

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
    "wallet_address": "0x..."
}
```

Response:
```json
{
    "token": "jwt_token_here",
    "wallet_address": "0x..."
}
```

### Teams

#### Get Teams
```bash
GET /api/teams/0x...
Authorization: Bearer jwt_token_here
```

Response:
```json
{
    "teams": [
        {
            "team_id": 537,
            "name": "Team Name",
            "image": "image_url"
        }
    ]
}
```

### Competition

#### Enter Competition
```bash
POST /api/competition/enter
Authorization: Bearer jwt_token_here
Content-Type: application/json

{
    "teamId": 537
}
```

Response:
```json
{
    "text": "Entry pending for Team 537 in Competition 1",
    "type": "text"
}
```

## Error Handling

The API uses standard HTTP status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

Error responses follow this format:
```json
{
    "error": "Error message here",
    "details": "Additional error details (if any)"
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please make sure to update tests as appropriate and follow the existing code style.

## License

[License Type] - see LICENSE file for details