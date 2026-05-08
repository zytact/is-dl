package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Client struct {
	BaseURL string
	http    *http.Client
}

type ScrapeOptions struct {
	Keywords        string `json:"keywords"`
	Location        string `json:"location"`
	Limit           int    `json:"limit"`
	ExperienceLevel string `json:"experienceLevel,omitempty"`
	JobType         string `json:"jobType,omitempty"`
	PostedWithin    string `json:"postedWithin,omitempty"`
	RemoteOnly      bool   `json:"remoteOnly"`
	Headless        bool   `json:"headless"`
}

type SSEEvent struct {
	Type       string `json:"type"`
	IsScraping bool   `json:"isScraping"`
	Message    string `json:"message"`
}

type JobListing struct {
	JobID            *string `json:"jobId"`
	JobURL           string  `json:"jobUrl"`
	Title            *string `json:"title"`
	CompanyName      *string `json:"companyName"`
	LocationText     *string `json:"locationText"`
	PostedAtText     *string `json:"postedAtText"`
	CompanyURL       *string `json:"companyUrl"`
	PostedAtIso      *string `json:"postedAtIso"`
	JobType          *string `json:"jobType"`
	AlumniCount      *string `json:"alumniCount"`
	DescriptionText  *string `json:"descriptionText"`
	RequirementsText *string `json:"requirementsText"`
}

type Filters struct {
	ExperienceLevel []string `json:"experienceLevel"`
	RemoteOnly      *bool    `json:"remoteOnly"`
	PostedWithin    *string  `json:"postedWithin"`
	JobType         []string `json:"jobType"`
}

type SearchMeta struct {
	Query     string  `json:"query"`
	Location  string  `json:"location"`
	Filters   Filters `json:"filters"`
	ScrapedAt string  `json:"scrapedAt"`
	Source    string  `json:"source"`
	Count     int     `json:"count"`
}

type ResultMeta struct {
	Filename string     `json:"filename"`
	Meta     SearchMeta `json:"meta"`
	Count    int        `json:"count"`
}

type ResultList struct {
	Results []ResultMeta `json:"results"`
}

type ResultFile struct {
	Meta SearchMeta   `json:"meta"`
	Jobs []JobListing `json:"jobs"`
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) StartScrape(opts ScrapeOptions) error {
	return c.postJSON("/api/scrape", opts)
}

func (c *Client) AbortScrape() error {
	return c.postJSON("/api/abort", map[string]bool{"abort": true})
}

func (c *Client) StreamLogs(ctx context.Context, out chan<- SSEEvent) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/api/logs", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")

	httpClient := &http.Client{}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("logs stream failed: %s", string(body))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data:") {
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "" {
				continue
			}
			var evt SSEEvent
			if err := json.Unmarshal([]byte(payload), &evt); err == nil {
				out <- evt
			}
		}
	}

	if err := scanner.Err(); err != nil && !errors.Is(err, context.Canceled) {
		return err
	}
	return nil
}

func (c *Client) ListResults() ([]ResultMeta, error) {
	var list ResultList
	if err := c.getJSON("/api/results", &list); err != nil {
		return nil, err
	}
	return list.Results, nil
}

func (c *Client) GetResult(filename string) (*ResultFile, error) {
	var result ResultFile
	if err := c.getJSON("/api/results/"+urlEscape(filename), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) DeleteResult(filename string) error {
	req, err := http.NewRequest(http.MethodDelete, c.BaseURL+"/api/results/"+urlEscape(filename), nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete failed: %s", string(body))
	}
	return nil
}

func (c *Client) ExportZIP(destDir string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, c.BaseURL+"/api/results/export", nil)
	if err != nil {
		return "", err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("export failed: %s", string(body))
	}

	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return "", err
	}

	filename := filepath.Join(destDir, "results-export.zip")
	file, err := os.Create(filename)
	if err != nil {
		return "", err
	}
	defer file.Close()

	if _, err := io.Copy(file, resp.Body); err != nil {
		return "", err
	}
	return filename, nil
}

func (c *Client) postJSON(path string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("request failed: %s", string(msg))
	}
	return nil
}

func (c *Client) getJSON(path string, out any) error {
	req, err := http.NewRequest(http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("request failed: %s", string(msg))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func urlEscape(value string) string {
	return url.PathEscape(value)
}
