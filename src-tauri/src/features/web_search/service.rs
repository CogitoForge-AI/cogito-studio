use super::config::{
    WebSearchProvider, DEFAULT_PROVIDER, KEY_EXA_API_KEY, KEY_PROVIDER, KEY_TAVILY_API_KEY,
};
use super::exa_client;
use super::models::NormalizedSearchResult;
use super::tavily_client;
use crate::error::AppError;
use crate::features::app_settings::service::AppSettingsService;

pub struct WebSearchConfig {
    pub provider: WebSearchProvider,
    pub tavily_api_key: Option<String>,
    pub exa_api_key: Option<String>,
}

pub struct WebSearchService {
    config: WebSearchConfig,
}

impl WebSearchService {
    pub fn from_app_settings(service: &AppSettingsService) -> Result<Self, AppError> {
        let tavily_api_key = service.get_by_key(KEY_TAVILY_API_KEY)?;
        let exa_api_key = service.get_by_key(KEY_EXA_API_KEY)?;
        let provider_raw = service
            .get_by_key(KEY_PROVIDER)?
            .unwrap_or_else(|| DEFAULT_PROVIDER.to_string());
        let provider = WebSearchProvider::parse(&provider_raw).map_err(AppError::Validation)?;

        Ok(Self {
            config: WebSearchConfig {
                provider,
                tavily_api_key: non_empty(tavily_api_key),
                exa_api_key: non_empty(exa_api_key),
            },
        })
    }

    pub fn is_tool_available(&self) -> bool {
        self.active_api_key().is_some()
    }

    pub fn active_api_key(&self) -> Option<&str> {
        match self.config.provider {
            WebSearchProvider::Tavily => self.config.tavily_api_key.as_deref(),
            WebSearchProvider::Exa => self.config.exa_api_key.as_deref(),
        }
    }

    pub const fn provider(&self) -> WebSearchProvider {
        self.config.provider
    }

    pub async fn search(
        &self,
        query: &str,
        max_results: u8,
    ) -> Result<NormalizedSearchResult, AppError> {
        let max_results = max_results.clamp(1, 10);
        let api_key = self.active_api_key().ok_or_else(|| {
            AppError::Validation(format!(
                "No API key configured for {}. Please add your API key in Settings > Web Search.",
                self.config.provider.as_str()
            ))
        })?;

        match self.config.provider {
            WebSearchProvider::Tavily => {
                let (answer, results) = tavily_client::search(api_key, query, max_results).await?;
                Ok(NormalizedSearchResult {
                    provider: WebSearchProvider::Tavily.as_str().to_string(),
                    query: query.to_string(),
                    answer,
                    results,
                })
            }
            WebSearchProvider::Exa => {
                let results = exa_client::search(api_key, query, max_results).await?;
                Ok(NormalizedSearchResult {
                    provider: WebSearchProvider::Exa.as_str().to_string(),
                    query: query.to_string(),
                    answer: None,
                    results,
                })
            }
        }
    }

    pub async fn test_connection(
        provider: WebSearchProvider,
        api_key: &str,
    ) -> Result<(), AppError> {
        if api_key.trim().is_empty() {
            return Err(AppError::Validation("API key is required".to_string()));
        }

        match provider {
            WebSearchProvider::Tavily => {
                tavily_client::search(api_key, "test", 1).await?;
            }
            WebSearchProvider::Exa => {
                exa_client::search(api_key, "test", 1).await?;
            }
        }

        Ok(())
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn web_search_from_parts(
        provider: WebSearchProvider,
        tavily_api_key: Option<String>,
        exa_api_key: Option<String>,
    ) -> WebSearchService {
        WebSearchService {
            config: WebSearchConfig {
                provider,
                tavily_api_key: non_empty(tavily_api_key),
                exa_api_key: non_empty(exa_api_key),
            },
        }
    }

    #[test]
    fn is_tool_available_requires_active_provider_key() {
        let svc = web_search_from_parts(
            WebSearchProvider::Tavily,
            Some("tvly-key".to_string()),
            None,
        );
        assert!(svc.is_tool_available());

        let svc = web_search_from_parts(
            WebSearchProvider::Tavily,
            None,
            Some("exa-key".to_string()),
        );
        assert!(!svc.is_tool_available());

        let svc = web_search_from_parts(
            WebSearchProvider::Exa,
            Some("tvly-key".to_string()),
            Some("exa-key".to_string()),
        );
        assert!(svc.is_tool_available());
    }

    #[test]
    fn provider_parse_works() {
        assert_eq!(
            WebSearchProvider::parse("tavily").unwrap(),
            WebSearchProvider::Tavily
        );
        assert_eq!(
            WebSearchProvider::parse("EXA").unwrap(),
            WebSearchProvider::Exa
        );
        assert!(WebSearchProvider::parse("bing").is_err());
    }

    #[test]
    fn non_empty_filters_blank_keys() {
        assert_eq!(non_empty(Some("  ".to_string())), None);
        assert_eq!(non_empty(Some("key".to_string())), Some("key".to_string()));
    }
}
