const mockGenerateUploadUrl = jest.fn();
const mockGenerateViewUrl = jest.fn();
const mockParseS3Url = jest.fn();
const mockIsValidS3Url = jest.fn();
const mockGetOrCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateValidation = jest.fn();
const mockConsumeTry = jest.fn();
const mockSavePredictionId = jest.fn();
const mockSaveResult = jest.fn();
const mockMarkFailed = jest.fn();
const mockValidatePhoto = jest.fn();
const mockSubmitTryOnRequest = jest.fn();
const mockCheckPredictionStatus = jest.fn();
const mockS3GetObjectPromise = jest.fn();

let sessionState;

jest.mock('../../services/s3Service', () => ({
  generateUploadUrl: (...args) => mockGenerateUploadUrl(...args),
  generateViewUrl: (...args) => mockGenerateViewUrl(...args),
  parseS3Url: (...args) => mockParseS3Url(...args),
  isValidS3Url: (...args) => mockIsValidS3Url(...args)
}));

jest.mock('../../services/sessionStore-simple', () => ({
  getOrCreateSession: (...args) => mockGetOrCreateSession(...args),
  getSession: (...args) => mockGetSession(...args),
  updateValidation: (...args) => mockUpdateValidation(...args),
  consumeTry: (...args) => mockConsumeTry(...args),
  savePredictionId: (...args) => mockSavePredictionId(...args),
  saveResult: (...args) => mockSaveResult(...args),
  markFailed: (...args) => mockMarkFailed(...args)
}));

jest.mock('../../validators/photoCheck', () => ({
  validatePhoto: (...args) => mockValidatePhoto(...args)
}));

jest.mock('../../services/fashnClient', () => ({
  submitTryOnRequest: (...args) => mockSubmitTryOnRequest(...args),
  checkPredictionStatus: (...args) => mockCheckPredictionStatus(...args)
}));

jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => ({
    getObject: jest.fn().mockImplementation(() => ({
      promise: (...args) => mockS3GetObjectPromise(...args)
    }))
  }))
}));

const handler = require('../../handler-simple');

function makeContext() {
  return { callbackWaitsForEmptyEventLoop: true };
}

function makeEvent({ path, method, body = null, sessionId = null }) {
  return {
    path,
    httpMethod: method,
    headers: { origin: 'https://demo.example.com' },
    body: body ? JSON.stringify(body) : null,
    pathParameters: sessionId ? { sessionId } : null,
    requestContext: {
      requestId: `req-${Math.random().toString(16).slice(2)}`,
      identity: { sourceIp: '198.51.100.20' }
    }
  };
}

function parseResponse(response) {
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body)
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  sessionState = {
    sessionId: '2e8e9ac4-1302-4a89-bf30-1d91b06135a2',
    ipHash: 'hashed-ip',
    status: 'created',
    triesLeft: 3,
    personImageUrl: null,
    resultImageUrl: null,
    predictionId: null,
    updatedAt: Date.now(),
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  };

  mockGenerateUploadUrl.mockResolvedValue({
    uploadUrl: 'https://wishlize-uploads-mumbai.s3.ap-south-1.amazonaws.com/',
    publicUrl: 'https://wishlize-uploads-mumbai.s3.ap-south-1.amazonaws.com/uploads/session/photo.jpg',
    fields: { key: 'uploads/session/photo.jpg' },
    key: 'uploads/session/photo.jpg',
    expiresIn: 300,
    maxFileSize: 10485760
  });
  mockGenerateViewUrl.mockResolvedValue('https://signed-garment-url.example.com/garments/blazer.jpg');
  mockParseS3Url.mockReturnValue(null);
  mockIsValidS3Url.mockReturnValue(false);

  mockGetOrCreateSession.mockImplementation(async () => ({ ...sessionState }));
  mockGetSession.mockImplementation(async () => ({ ...sessionState }));

  mockUpdateValidation.mockImplementation(async (_sessionId, validationResult, imageUrl) => {
    sessionState.status = validationResult.valid ? 'validated' : 'validation_failed';
    sessionState.personImageUrl = imageUrl;
    sessionState.updatedAt = Date.now();
    return { ...sessionState };
  });

  mockConsumeTry.mockImplementation(async () => {
    if (sessionState.status !== 'validated') {
      throw new Error('INVALID_STATE');
    }
    sessionState.triesLeft -= 1;
    sessionState.status = 'processing';
    sessionState.updatedAt = Date.now();
    return sessionState.triesLeft;
  });

  mockSavePredictionId.mockImplementation(async (_sessionId, predictionId) => {
    sessionState.predictionId = predictionId;
    sessionState.updatedAt = Date.now();
    return { ...sessionState };
  });

  mockSaveResult.mockImplementation(async (_sessionId, resultUrl) => {
    sessionState.status = 'completed';
    sessionState.resultImageUrl = resultUrl;
    sessionState.updatedAt = Date.now();
    return { ...sessionState };
  });

  mockMarkFailed.mockImplementation(async (_sessionId, message) => {
    sessionState.status = 'failed';
    sessionState.errorMessage = message;
    sessionState.updatedAt = Date.now();
    return { ...sessionState };
  });

  mockS3GetObjectPromise.mockResolvedValue({ Body: Buffer.from('fake-image-buffer') });
  mockValidatePhoto.mockResolvedValue({
    valid: true,
    type: 'face_detected',
    message: 'Face detected',
    confidence: 0.98
  });
  mockSubmitTryOnRequest.mockResolvedValue({
    predictionId: 'pred_123',
    status: 'processing'
  });
  mockCheckPredictionStatus.mockResolvedValue({
    status: 'completed',
    output: ['https://wishlize-results-mumbai.s3.ap-south-1.amazonaws.com/results/tryon.jpg']
  });
});

describe('handler-simple flow integration', () => {
  test('completes upload -> validate -> process -> status flow', async () => {
    const uploadEvent = makeEvent({
      path: '/get-upload-url',
      method: 'POST',
      body: { fileType: 'image/jpeg' }
    });
    const uploadResponse = parseResponse(await handler.getUploadUrl(uploadEvent, makeContext()));

    expect(uploadResponse.statusCode).toBe(200);
    expect(uploadResponse.body.success).toBe(true);
    expect(uploadResponse.body.sessionId).toBe(sessionState.sessionId);

    const validateEvent = makeEvent({
      path: '/validate-photo',
      method: 'POST',
      body: {
        sessionId: sessionState.sessionId,
        imageUrl: uploadResponse.body.publicUrl
      }
    });
    const validateResponse = parseResponse(await handler.validatePhoto(validateEvent, makeContext()));

    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.body.success).toBe(true);
    expect(validateResponse.body.valid).toBe(true);
    expect(sessionState.status).toBe('validated');

    const processEvent = makeEvent({
      path: '/process-tryon',
      method: 'POST',
      body: {
        sessionId: sessionState.sessionId,
        garmentUrl: 'https://wishlize-cdn.s3.ap-south-1.amazonaws.com/garments/blazer.jpg'
      }
    });
    const processResponse = parseResponse(await handler.processTryOn(processEvent, makeContext()));

    expect(processResponse.statusCode).toBe(200);
    expect(processResponse.body.success).toBe(true);
    expect(processResponse.body.status).toBe('processing');
    expect(processResponse.body.triesRemaining).toBe(2);
    expect(mockSubmitTryOnRequest).toHaveBeenCalledTimes(1);
    expect(mockConsumeTry).toHaveBeenCalledTimes(1);

    const statusEvent = makeEvent({
      path: `/status/${sessionState.sessionId}`,
      method: 'GET',
      sessionId: sessionState.sessionId
    });
    const statusResponse = parseResponse(await handler.checkStatus(statusEvent, makeContext()));

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body.success).toBe(true);
    expect(statusResponse.body.status).toBe('completed');
    expect(statusResponse.body.resultUrl).toContain('/results/tryon.jpg');
  });

  test('does not consume quota when FASHN submission fails', async () => {
    sessionState.status = 'validated';
    sessionState.personImageUrl = 'https://wishlize-uploads-mumbai.s3.ap-south-1.amazonaws.com/uploads/session/photo.jpg';

    mockSubmitTryOnRequest.mockRejectedValueOnce(new Error('FASHN unavailable'));

    const processEvent = makeEvent({
      path: '/process-tryon',
      method: 'POST',
      body: {
        sessionId: sessionState.sessionId,
        garmentUrl: 'https://wishlize-cdn.s3.ap-south-1.amazonaws.com/garments/blazer.jpg'
      }
    });
    const processResponse = parseResponse(await handler.processTryOn(processEvent, makeContext()));

    expect(processResponse.statusCode).toBe(500);
    expect(processResponse.body.success).toBe(false);
    expect(mockConsumeTry).not.toHaveBeenCalled();
    expect(sessionState.triesLeft).toBe(3);
  });
});
