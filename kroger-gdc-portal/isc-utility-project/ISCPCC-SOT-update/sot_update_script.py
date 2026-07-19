import os
import sys
import shutil
import subprocess
import pandas as pd
import logging
import time
from git import Repo, GitCommandError
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
load_dotenv()

#logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
 
# --- CONFIGURATION ---
REPO_DIR = "./gdce-acm"
REPO_URL = "git@github.com:kroger.com/gdce-acm.git"

REPO_CSV_PATH = os.path.join(REPO_DIR, "iscpcc", "source_of_truth.csv")
TARGET_BRANCH = "lab"
BRANCH_NAME = "update-sot-by-iscpcc"

#APP_CSV_PATH = "/iscpcc/source_of_truth.csv"

DB_CONNECT_STR =os.getenv("DB_CONN")
DB_QUERY = os.getenv("DB_QUERY","sot_table")

REQUIRED_COLUMNS = {"cluster_name"}

MAX_RETRIES = 3
RETRY_DELAY = 5  


if not REPO_URL or not DB_CONNECT_STR or not DB_QUERY :
    logging.critical("missing required env var/ credentials")
    sys.exit(1)

#retry wrapper

def retry(func):
    def wrapper(*args, **kwargs):
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logging.warning(f"{func.__name__} failed (attempt {attempt}/{MAX_RETRIES}): {e}")
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(RETRY_DELAY)
    return wrapper


def validate_dataframe(df: pd.DataFrame):
    if df.empty:
        raise ValueError("Dataframe is empty")

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if df["cluster_name"].isnull().any():
        raise ValueError("Null values found in 'cluster_name'")

@retry
def fetch_data_iscpcc_sot():
    logging.info("fetching sot from app")

    try:
        engine = create_engine(DB_CONNECT_STR)
        with engine.connect() as conn:
            df = pd.read_sql(DB_QUERY, conn)

        logging.info(f"DB rows fetched: {len(df)}")
        validate_dataframe(df)
        return df
    except SQLAlchemyError as e:
        logging.error(f"failed to fetch data from db: {e}")
        raise

@retry
# Clone or pull the latest repository
def clone_or_pull_repo():
    if not os.path.exists(REPO_DIR):
        logging.info(f"Cloning repo (branch: {TARGET_BRANCH})")
        return Repo.clone_from(REPO_URL, REPO_DIR, branch=TARGET_BRANCH)

    logging.info("Updating existing repo")

    repo = Repo(REPO_DIR)

    if repo.is_dirty(untracked_files=True):
        logging.warning("Repo has local changes. Resetting...")
        repo.git.reset("--hard")

    logging.info("Pulling latest repository changes...")
    repo.git.checkout(TARGET_BRANCH)
    repo.git.pull("origin", TARGET_BRANCH)

    return repo

@retry
#push to repo
def push_changes(repo):
    logging.info(f"Pushing changes to '{TARGET_BRANCH}'")
    repo.git.push("origin", TARGET_BRANCH)


# def normalize_df(df: pd.DataFrame):
#     df = df.copy()
#     df = df.sort_values(by="cluster_name").reset_index(drop=True)
#     df = df.fillna("")  # reduce NaN noise
#     return df

def sync_sot():

    #fetch db to check valid
    try:
        #app_df = pd.read_csv(APP_CSV_PATH).sort_values(by="cluster_name").reset_index(drop=True)
        app_df = fetch_data_iscpcc_sot()
        app_df = app_df.sort_values(by="cluster_name").reset_index(drop=True)
    
        repo = clone_or_pull_repo()

        #  Normalize and compare CSVs to avoid white-space or sorting diffs

        
        if os.path.exists(REPO_CSV_PATH):
            repo_df = pd.read_csv(REPO_CSV_PATH).sort_values(by="cluster_name").reset_index(drop=True)
            if app_df.equals(repo_df):
                logging.info("No changes detected between the App and Git. Exiting.")
                return
        
        logging.info("Changes detected! Processing updates...")

        os.makedirs(os.path.dirname(REPO_CSV_PATH), exist_ok = True)
        app_df.to_csv(REPO_CSV_PATH, index=False)

        ##option A: directly commit to lab branch    
    
        repo.git.add(REPO_CSV_PATH)
        commit = repo.index.commit("update cluster source of truth")
        logging.info(f"Committed changes: {commit.hexsha}")
    
        push_changes(repo)
        logging.info("Sync complete")

        ##option B: commit to FEATURE branch and create a PR to lab

        # #  Create a isolated feature branch
        # if BRANCH_NAME in repo.heads:
        #     repo.delete_head(BRANCH_NAME, focre = True)
        # new_branch = repo.create_head(BRANCH_NAME, repo.remote.origin.refs[TARGET_BRANCH])
        # new_branch.checkout()
    
        # #  Copy the new CSV into the repository
        # app_df.to_csv(REPO_CSV_PATH, index=False)
    
        # #  Commit the changes
        # repo.git.add(REPO_CSV_PATH)
        # commit = repo.index.commit("update cluster source of truth")
        # logging.info(f"Committed changes: {commit.hexsha}")
    
        # #  Push changes and open a Pull Request
        # logging.info("Pushing changes to remote...")
        # repo.git.push("--set-upstream", "origin", BRANCH_NAME, force=True)
    
        # logging.info("Creating Pull Request via GitHub CLI...")
        # subprocess.run([
        #     "gh", "pr", "create",
        #     "--title", "Automated Iscpcc sot Update",
        #     "--body", "This PR was automatically generated to sync sot changes from the iscpcc.",
        #     "--base", TARGET_BRANCH,
        #     "--head", BRANCH_NAME
        # ], cwd=REPO_DIR)
        #logging.info("Sync complete")
    except Exception as e:
        logging.error(f"sync failed: {e}")
        sys.exit(1)
 
if __name__ == "__main__":
    sync_sot()