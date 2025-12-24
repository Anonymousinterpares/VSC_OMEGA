import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as mime from 'mime-types';
import { SettingsService } from './SettingsService';
import { app } from 'electron';

export interface ISearchResultItem {
    title: string;
    link: string;
    snippet: string;
}

export class WebBrowserService {
    private settingsService: SettingsService;
    private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    constructor(settingsService: SettingsService) {
        this.settingsService = settingsService;
    }

    /**
     * Searches the web using Google Custom Search API.
     * Fallback: If no API key, it throws an error (scrapers are too brittle for reliable "Deep Research").
     */
    async search(query: string): Promise<ISearchResultItem[]> {
        const settings = await this.settingsService.getSettings();
        
        if (!settings.googleSearchApiKey || !settings.googleSearchCx) {
             // Fallback to a clear error message guiding the user
             throw new Error("Google Search API Key and Search Engine ID (CX) are required in Settings for web searching.");
        }

        try {
            const url = `https://www.googleapis.com/customsearch/v1?key=${settings.googleSearchApiKey}&cx=${settings.googleSearchCx}&q=${encodeURIComponent(query)}`;
            const response = await axios.get(url);
            
            if (response.data.items) {
                return response.data.items.map((item: any) => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                }));
            }
            return [];
        } catch (error: any) {
            console.error("Web Search Error:", error);
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Visits a URL and extracts the main text content and images.
     */
    async visitPage(url: string): Promise<{ title: string; text: string; images: string[] }> {
        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': this.userAgent },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);

            // Remove scripts, styles, and other noise
            $('script').remove();
            $('style').remove();
            $('nav').remove();
            $('footer').remove();
            $('header').remove();

            const title = $('title').text().trim();
            
            // Extract text roughly preserving structure
            const text = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 15000); // Limit context

            // Extract images (absolute URLs)
            const images: string[] = [];
            
            // 1. Check Meta Tags (High Quality)
            $('meta[property="og:image"]').each((_, el) => {
                const content = $(el).attr('content');
                if (content) images.push(content);
            });
            $('meta[name="twitter:image"]').each((_, el) => {
                const content = $(el).attr('content');
                if (content) images.push(content);
            });

            // 2. Check Image Tags (including lazy loading)
            $('img').each((_, el) => {
                const $img = $(el);
                // Check common lazy loading attributes first
                let src = $img.attr('data-src') || 
                          $img.attr('data-original') || 
                          $img.attr('data-url') || 
                          $img.attr('src');
                
                if (src) {
                    // Skip data URIs (too long for context) and SVGs (often icons)
                    if (src.startsWith('data:') || src.endsWith('.svg')) return;

                    if (!src.startsWith('http')) {
                        // Handle relative URLs
                        try {
                            const absolute = new URL(src, url).href;
                            images.push(absolute);
                        } catch (e) { /* ignore invalid urls */ }
                    } else {
                        images.push(src);
                    }
                }
            });

            // 3. Filter and Deduplicate
            // Remove obviously small/icon paths if possible (heuristic)
            const qualityImages = images.filter(img => {
                const lower = img.toLowerCase();
                return !lower.includes('icon') && 
                       !lower.includes('logo') && 
                       !lower.includes('avatar') &&
                       !lower.includes('pixel') &&
                       !lower.includes('spacer');
            });

            return { title, text, images: [...new Set(qualityImages)] }; // Unique images
        } catch (error: any) {
            throw new Error(`Failed to visit page ${url}: ${error.message}`);
        }
    }

    /**
     * Downloads an image to a temporary path.
     */
    async downloadImage(url: string): Promise<string> {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'User-Agent': this.userAgent }
            });

            const contentType = response.headers['content-type'];
            
            // 1. Validate Content Type
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error(`Invalid content-type: ${contentType}. Expected an image.`);
            }

            // 2. Validate Size (Minimum 2KB to avoid tracking pixels or empty files)
            const minSize = 2048; 
            if (response.data.length < minSize) {
                throw new Error(`Image too small (${response.data.length} bytes). Likely a tracking pixel or icon.`);
            }

            const extension = mime.extension(contentType) || 'jpg';
            const filename = `img_${Date.now()}.${extension}`;
            
            // Save to temp folder
            const tempDir = path.join(app.getPath('userData'), 'temp_images');
            await fs.ensureDir(tempDir);
            
            const filePath = path.join(tempDir, filename);
            await fs.writeFile(filePath, response.data);
            
            return filePath;
        } catch (error: any) {
            throw new Error(`Failed to download image ${url}: ${error.message}`);
        }
    }
}
