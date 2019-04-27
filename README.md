# Webhooks Deploy

A lightweight server used to deploy a new version of the
[K-App](https://github.com/K-Fet/K-App/).

## Environment variables

- `PORT`: Server listening port
- `TOKEN_HASH`: argon2 hash of a token

## Actions

The server have only one endpoint at root:
```
POST webhhoks.example.com/
Content-Type: application/json

{
  "action": "<action-name>",
  "token": "<token>",
  "param1": "value1",
  ...
}
```

Bellow are listed all actions available.

### Deploy prod

Deploy a new version to prod.

```json5
{
  "action": "deploy-prod",
  "token": "<token>",
  "sha": "<commit-sha>"
}
```

Response: a [reporter object](#reporter-object).

### Deploy staging

Deploy a new version to staging.

```json5
{
  "action": "deploy-staging",
  "token": "<token>",
  "sha": "<commit-sha>"
}
```

Response: a [reporter object](#reporter-object).

### Follow action

Follow advancement for a task.

```json5
{
  "action": "follow-action",
  "token": "<token>",
  "id": "<reporter-uuid>"
}
```

Response: a [reporter object](#reporter-object).

### Cancel action

Cancel a task.

```json5
{
  "action": "cancel-action",
  "token": "<token>",
  "id": "<reporter-uuid>"
}
```

Response: a [reporter object](#reporter-object).


## Reporter object

The reporter object allows you to have an idea how the deployment is going.

Fields:
- `id`: Generated uuid
- `state`: One of:
  - `ENQUEUED`: Task is enqueued but not started
  - `RUNNING`: Task is running
  - `COMPLETED`: Task ended successfully
  - `CANCELLING`: Task is currently cancelling (after a timeout or a cancel request)
  - `CANCELLED`: Task was cancelled successfully
  - `FAILED_CANCELLING`: Task failed at cancelling
- `progress`: Progress status (between 0 and 100)
- `startDate`: Date when task was set `RUNNING`
- `endDate`: Date when task was `COMPLETED` or `CANCELLING` 
  
  
Example:
```json5
{
  "id": "4b9732ea-32b9-4614-af4a-7c0f2e7ef889",
  "state": "RUNNING",
  "progress": 60,
  "startDate": "2019-04-27T13:10:56.883Z",
  "endDate": null
}
```
