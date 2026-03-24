/**
 * Search Service (SerpApi)
 */

class SearchService {
  async searchCompanies(query, limit = 10) {
    // TODO: Implement SerpApi integration
    console.log(`Searching for: ${query}`);
    return [];
  }

  async getCompanyInfo(companyName) {
    // TODO: Implement company info lookup
    console.log(`Getting info for: ${companyName}`);
    return null;
  }
}

module.exports = new SearchService();
