export interface HostUser {
  username: string;
  home_dir: string;
  shell: string;
  status: string;
  ftp_enabled: boolean;
}

export interface UserForm {
  username: string;
  password: string;
  portal_password: string;
}
