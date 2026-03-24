// Placeholder for search service using SerpApi
export class SearchService {
  async searchCompanies(query: string, limit = 10) {
    // TODO: Implement SerpApi integration
    console.log(`Searching for companies: ${query}`);
    return [];
  }

  async searchOnGoogle(query: string) {
    // TODO: Implement Google search via SerpApi
    console.log(`Google search: ${query}`);
    return [];
  }
}

export const searchService = new SearchService();
