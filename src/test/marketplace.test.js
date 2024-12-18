const { MarketplaceManager, templateMetadataSchema } = require('../marketplace/core');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('Marketplace Manager', () => {
    let manager;
    const validTemplate = {
        name: 'test-template',
        version: '1.0.0',
        description: 'A test template for development',
        author: 'DevForge Team',
        type: 'project',
        compatibility: {
            nodeVersion: '>=14',
            devforgeVersion: '>=1.0.0'
        }
    };

    beforeEach(() => {
        manager = new MarketplaceManager();
        jest.clearAllMocks();
    });

    describe('Template Publication', () => {
        test('publishes valid template successfully', async () => {
            // Mock getTemplate to return null (template doesn't exist)
            axios.get.mockResolvedValueOnce({ data: null });
            
            // Mock successful template publication
            axios.post.mockResolvedValueOnce({ 
                data: { 
                    ...validTemplate, 
                    id: 'template-123',
                    publishedAt: new Date().toISOString() 
                } 
            });

            const result = await manager.publishTemplate(validTemplate, '/path/to/template');
            expect(result).toBeDefined();
            expect(result.id).toBe('template-123');
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/templates'),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                })
            );
        });

        test('fails with invalid template metadata', async () => {
            const invalidTemplate = { ...validTemplate, name: '!invalid!' };
            await expect(manager.publishTemplate(invalidTemplate, '/path/to/template'))
                .rejects.toThrow();
        });
    });

    describe('Template Search', () => {
        test('searches templates with query', async () => {
            const mockTemplates = [validTemplate];
            axios.get.mockResolvedValueOnce({ data: mockTemplates });

            const results = await manager.searchTemplates('test');
            expect(results).toEqual(mockTemplates);
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining('/templates/search'),
                expect.objectContaining({
                    params: expect.objectContaining({ q: 'test' })
                })
            );
        });

        test('uses cache for repeated searches', async () => {
            const mockTemplates = [validTemplate];
            axios.get.mockResolvedValueOnce({ data: mockTemplates });

            await manager.searchTemplates('test');
            const cachedResults = await manager.searchTemplates('test');
            
            expect(cachedResults).toEqual(mockTemplates);
            expect(axios.get).toHaveBeenCalledTimes(1);
        });
    });

    describe('Template Download', () => {
        test('downloads template successfully', async () => {
            const mockStream = {};
            axios.get
                .mockResolvedValueOnce({ data: validTemplate }) // getTemplate call
                .mockResolvedValueOnce({ data: mockStream }); // download call

            const result = await manager.downloadTemplate('test-template', 'latest', '/target/path');
            expect(result).toEqual(validTemplate);
            expect(axios.get).toHaveBeenCalledTimes(2);
        });

        test('fails when template does not exist', async () => {
            axios.get.mockRejectedValueOnce(new Error('Template not found'));

            await expect(manager.downloadTemplate('non-existent'))
                .rejects.toThrow('Template not found');
        });
    });

    describe('Cache Management', () => {
        test('clears cache successfully', () => {
            manager.setCache('test-key', { data: 'test' });
            expect(manager.getFromCache('test-key')).toBeDefined();
            
            manager.clearCache();
            expect(manager.getFromCache('test-key')).toBeNull();
        });

        test('cache expires after timeout', async () => {
            manager.cacheTimeout = 100; // Set short timeout for testing
            manager.setCache('test-key', { data: 'test' });
            
            expect(manager.getFromCache('test-key')).toBeDefined();
            
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(manager.getFromCache('test-key')).toBeNull();
        });
    });
});
