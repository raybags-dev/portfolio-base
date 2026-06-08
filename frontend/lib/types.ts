// TypeScript mirror of the backend public contract.

export interface SiteConfiguration {
  site_name: string;
  tagline?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  og_image_url?: string | null;
  twitter_handle?: string | null;
  analytics_provider?: string | null;
  analytics_id?: string | null;
  cookie_banner_enabled: boolean;
  cookie_banner_text?: string | null;
  maintenance_mode: boolean;
  default_locale: string;
  contact_email?: string | null;
  phone?: string | null;
  location_address?: string | null;
  map_embed_url?: string | null;
}

export interface Theme {
  name: string;
  default_mode: "dark" | "light";
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_dark: string;
  background_light: string;
  text_dark: string;
  text_light: string;
  font_family: string;
  heading_font_family?: string | null;
  base_font_size: string;
  spacing_unit: string;
  border_radius: string;
  card_shadow: string;
  animations_enabled: boolean;
  parallax_enabled: boolean;
}

export interface Hero {
  title?: string | null;
  subtitle?: string | null;
  name?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  hero_image_url?: string | null;
  background_image_url?: string | null;
  background_color?: string | null;
  background_mode: "image" | "color" | "gradient";
  animation?: string | null;
  parallax_speed: number;
  is_visible: boolean;
  avatar_url?: string | null;
  avatar_shape?: "circle" | "rounded" | "none";
}

export interface Section {
  id: number;
  key: string;
  label: string;
  enabled: boolean;
  order: number;
  is_removable: boolean;
  in_nav: boolean;
}

export interface About {
  heading?: string | null;
  biography?: string | null;
  description?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  highlights?: string[] | null;
  is_visible: boolean;
}

export interface Resume {
  title: string;
  pdf_url?: string | null;
  is_generated: boolean;
  summary?: string | null;
  is_public: boolean;
}

export interface SocialLink {
  id: number;
  platform: string;
  url: string;
  icon?: string | null;
  label?: string | null;
  order: number;
  is_visible: boolean;
}

export interface ProjectImage {
  id: number;
  url: string;
  alt_text?: string | null;
  order: number;
}

export interface Project {
  id: number;
  title: string;
  slug: string;
  summary?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  video_url?: string | null;
  github_url?: string | null;
  demo_url?: string | null;
  status: string;
  tech_tags?: string[] | null;
  is_featured: boolean;
  is_hidden: boolean;
  order: number;
  service_key?: string | null;
  images?: ProjectImage[];
}

export interface Skill {
  id: number;
  name: string;
  category?: string | null;
  icon?: string | null;
  proficiency: number;
  order: number;
  is_visible: boolean;
}

export interface Recommendation {
  id: number;
  author_name: string;
  position?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  avatar_url?: string | null;
  quote: string;
  stars: number;
  order: number;
}

export interface TimelineEntry {
  id: number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  icon?: string | null;
  date_label?: string | null;
  sort_key: number;
}

export interface Experience {
  id: number;
  role: string;
  company?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current: boolean;
  description?: string | null;
  highlights?: string[] | null;
  order: number;
}

export interface Education {
  id: number;
  degree: string;
  institution?: string | null;
  field_of_study?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  order: number;
}

export interface Certification {
  id: number;
  name: string;
  issuer?: string | null;
  issue_date?: string | null;
  credential_url?: string | null;
  image_url?: string | null;
  order: number;
}

export interface Microservice {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  feature_flag_key?: string | null;
  base_url?: string | null;
  status: string;
  is_public: boolean;
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
}

export interface BlogTag {
  id: number;
  name: string;
  slug: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  content_markdown?: string | null;
  cover_image_url?: string | null;
  status: string;
  published_at?: string | null;
  reading_minutes?: number | null;
  meta_title?: string | null;
  meta_description?: string | null;
  category_id?: number | null;
  category?: BlogCategory | null;
  tags: BlogTag[];
  is_featured: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
  related?: BlogPost[];
}

export interface BlogComment {
  id: number;
  author_name: string;
  content: string;
  post_id: number;
  created_at: string;
}

export interface Bootstrap {
  site_configuration: SiteConfiguration;
  theme: Theme;
  hero: Hero;
  about: About;
  resume: Resume;
  social_links: SocialLink[];
  projects: Project[];
  skills: Skill[];
  recommendations: Recommendation[];
  timeline: TimelineEntry[];
  experiences: Experience[];
  education: Education[];
  certifications: Certification[];
  sections: Section[];
  feature_flags: Record<string, boolean>;
  microservices: Microservice[];
}

export interface FeatureFlag {
  id: number;
  key: string;
  label?: string | null;
  description?: string | null;
  enabled: boolean;
  group: string;
  config?: Record<string, unknown> | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
