pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          dir('Micro-auth') {
            // Assurer que le Dockerfile se trouve dans ce répertoire ou spécifier son chemin
            sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f Dockerfile ."
          }
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          try {
            withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
              sh '''
                kubectl config set-context --current --namespace="$KUBE_NAMESPACE"
                kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
                kubectl apply -f k8s/bibliotheque-auth-service.yaml
              '''
            }
          } catch (Exception e) {
            error "Deployment failed: ${e.getMessage()}"
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        retry(3) {
          timeout(time: 3, unit: 'MINUTES') {
            withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
              sh '''
                kubectl rollout status deployment/bibliotheque-auth \
                  --namespace="$KUBE_NAMESPACE" \
                  --timeout=180s
              '''
            }
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        try {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
            sh '''
              kubectl rollout undo deployment/bibliotheque-auth \
                --namespace="$KUBE_NAMESPACE" || true
            '''
          }
        } catch (Exception e) {
          echo "Rollback failed: ${e.getMessage()}"
        }
      }
    }
    always {
      sh 'docker logout "$REGISTRY" || true'
      echo "Pipeline execution completed"
    }
  }
}
